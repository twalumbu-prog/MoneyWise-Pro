package expo.modules.momocapture

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * The native half of mobile money capture. The SMS receiver and notification listener run without the JS app (the
 * process may have been started just for them), so filtering, queueing and delivery all live here: a matching message
 * is queued in app-private storage and POSTed to `/momo-capture/ingest` with the user's capture token. Anything that
 * fails to send stays queued and goes with the next message, or when the app calls flush().
 *
 * Only messages that look like mobile money confirmations leave the phone: the sender (or notification title) must
 * name a provider AND the text must carry an amount. Parsing and booking happen on the server.
 */
object MomoCapture {
    private const val TAG = "MomoCapture"
    private const val PREFS = "moneywise_momo_capture"
    // Must hold a whole SMS history import (up to 500 messages, queued faster than they send).
    private const val MAX_QUEUE = 600
    private const val MAX_ATTEMPTS = 6
    private val io = Executors.newSingleThreadExecutor()

    private val DEFAULT_SENDERS = Regex("(?i)(momo|mtn|airtel|zamtel|kwacha)")
    // "ZMW 5.00", "K50", "Amount 20" and MTN's number-first "0.36 ZMW".
    private val MONEY_HINT = Regex("(?i)(\\b(ZMW|ZK)\\s?[0-9]|(?<![A-Za-z0-9])K\\s?[0-9]|\\b(amount|amt)\\b|[0-9]\\s?(ZMW|ZK)\\b)")
    // A confirmation carries a transaction id. Lets a message through when the operator sends from a sender id we
    // do not know yet (a short code, a renamed id), as long as the text itself names the provider.
    private val TXN_HINT = Regex("(?i)\\b(tid|txn|trans(action)?\\.? ?id|ref(erence)?( no)?)\\b")
    private const val SAME_MESSAGE_WINDOW_MS = 15 * 60 * 1000L
    private const val RETRY_JOB_ID = 0x4D6F4D6F

    fun prefs(ctx: Context): SharedPreferences = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun configure(ctx: Context, apiUrl: String?, token: String?, smsEnabled: Boolean, notificationsEnabled: Boolean, senderPattern: String?, extraPackages: List<String>) {
        prefs(ctx).edit().apply {
            putString("apiUrl", apiUrl?.trimEnd('/'))
            if (token != null) putString("token", token)
            putBoolean("sms", smsEnabled)
            putBoolean("notifications", notificationsEnabled)
            putString("senderPattern", senderPattern)
            putString("packages", JSONArray(extraPackages).toString())
        }.apply()
        // A new key: send whatever was kept while the phone had none.
        if (token != null) flushAsync(ctx)
    }

    fun clear(ctx: Context) {
        prefs(ctx).edit().clear().apply()
    }

    fun smsEnabled(ctx: Context) = prefs(ctx).getBoolean("sms", false) && hasToken(ctx)
    fun notificationsEnabled(ctx: Context) = prefs(ctx).getBoolean("notifications", false) && hasToken(ctx)
    private fun hasToken(ctx: Context) = !prefs(ctx).getString("token", null).isNullOrEmpty()

    fun extraPackages(ctx: Context): Set<String> = try {
        val arr = JSONArray(prefs(ctx).getString("packages", "[]"))
        (0 until arr.length()).map { arr.getString(it) }.toSet()
    } catch (_: Exception) { emptySet() }

    private fun senderRegex(ctx: Context): Regex =
        prefs(ctx).getString("senderPattern", null)?.takeIf { it.isNotBlank() }?.let { runCatching { Regex(it, RegexOption.IGNORE_CASE) }.getOrNull() }
            ?: DEFAULT_SENDERS

    /** Sender/title names a provider, or the text does and it came from a provider app; and it mentions an amount. */
    fun looksLikeMomo(ctx: Context, sender: String?, text: String, fromProviderApp: Boolean = false): Boolean {
        if (text.length < 12 || !MONEY_HINT.containsMatchIn(text)) return false
        val re = senderRegex(ctx)
        if (sender != null && re.containsMatchIn(sender)) return true
        return re.containsMatchIn(text) && (fromProviderApp || TXN_HINT.containsMatchIn(text))
    }

    private fun digest(text: String): String {
        val norm = text.lowercase().replace(Regex("[^a-z0-9.]"), "")
        return MessageDigest.getInstance("SHA-256").digest(norm.toByteArray()).joinToString("") { "%02x".format(it) }.take(24)
    }

    /**
     * Queues a message and sends. The SMS and its notification are the same message, so wording already seen within a
     * few minutes is dropped; the same wording later on is another transaction (same amount, same person) and is kept.
     */
    fun capture(ctx: Context, source: String, sender: String?, text: String, occurredAtMs: Long, silent: Boolean = false) {
        val p = prefs(ctx)
        synchronized(this) {
            val key = digest(text)
            val seen = JSONArray(p.getString("seen", "[]"))
            for (i in 0 until seen.length()) {
                val parts = seen.optString(i).split("@")
                if (parts[0] != key) continue
                val at = parts.getOrNull(1)?.toLongOrNull()
                if (at == null || kotlin.math.abs(at - occurredAtMs) <= SAME_MESSAGE_WINDOW_MS) return
            }
            seen.put("$key@$occurredAtMs")
            val trimmedSeen = JSONArray().also { out -> (maxOf(0, seen.length() - 200) until seen.length()).forEach { out.put(seen.getString(it)) } }

            val queue = JSONArray(p.getString("queue", "[]"))
            queue.put(JSONObject().put("source", source).put("sender", sender ?: JSONObject.NULL).put("text", text).put("occurredAt", occurredAtMs).put("silent", silent))
            val trimmedQueue = JSONArray().also { out -> (maxOf(0, queue.length() - MAX_QUEUE) until queue.length()).forEach { out.put(queue.get(it)) } }
            p.edit().putString("seen", trimmedSeen.toString()).putString("queue", trimmedQueue.toString()).apply()
        }
        flushAsync(ctx)
    }

    fun queued(ctx: Context): Int = runCatching { JSONArray(prefs(ctx).getString("queue", "[]")).length() }.getOrDefault(0)

    fun flushAsync(ctx: Context, scheduleRetry: Boolean = true, done: ((Int) -> Unit)? = null) {
        val app = ctx.applicationContext
        io.execute {
            val sent = runCatching { flush(app) }.getOrDefault(0)
            // Whatever is left could not be sent (no signal, server trouble). Try again by itself when there is a
            // connection, instead of waiting for the next message or for the app to be opened.
            if (scheduleRetry && queued(app) > 0 && hasToken(app)) scheduleRetry(app)
            done?.invoke(sent)
        }
    }

    private fun scheduleRetry(ctx: Context) {
        runCatching {
            val js = ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
            js.schedule(
                JobInfo.Builder(RETRY_JOB_ID, ComponentName(ctx, MomoRetryJob::class.java))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setMinimumLatency(30_000)
                    .setBackoffCriteria(60_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                    .build()
            )
        }.onFailure { Log.w(TAG, "could not schedule a retry: ${it.message}") }
    }

    /** What a listener last saw and did with it, so the app can show why nothing is arriving. */
    fun note(ctx: Context, kind: String, result: String) {
        prefs(ctx).edit().putLong(kind + "At", System.currentTimeMillis()).putString(kind + "Result", result).apply()
    }

    /**
     * Why a source ("sms" / "notifications") is not capturing right now, or null when it is. A missing capture key
     * does not block: the message is kept on the phone and sent once the app has a key again.
     */
    fun blockedReason(ctx: Context, source: String): String? =
        if (!prefs(ctx).getBoolean(source, false)) "switched off" else null

    fun waitingForKey(ctx: Context) = !hasToken(ctx)

    /**
     * Sends queued messages in order. A network failure stops the run and keeps everything. A message the server keeps
     * failing on goes to the back of the queue (and is dropped after MAX_ATTEMPTS) so it cannot block the ones behind it.
     */
    private fun flush(ctx: Context): Int {
        val p = prefs(ctx)
        val api = p.getString("apiUrl", null) ?: return 0
        var sent = 0
        while (true) {
            // Read the key every time: the app may have replaced it while this run was sending.
            val token = p.getString("token", null)?.takeIf { it.isNotEmpty() } ?: break
            val head = synchronized(this) {
                val q = JSONArray(p.getString("queue", "[]"))
                if (q.length() == 0) null else q.getJSONObject(0)
            } ?: break
            val body = JSONObject(head.toString()).apply { remove("attempts"); remove("silent") }
            var reply = ""
            val code = try { post("$api/momo-capture/ingest", token, body).also { reply = it.second }.first } catch (e: Exception) {
                Log.w(TAG, "send failed: ${e.message}"); p.edit().putString("lastError", e.message ?: "network error").apply(); -1
            }
            // A new transaction waiting for a decision: ask straight away (not for an import of old messages).
            if (code in 200..299 && reply.contains("\"accepted\"") && !head.optBoolean("silent", false)) {
                runCatching {
                    val capture = JSONObject(reply).optJSONObject("capture")
                    if (capture != null && capture.optString("status") == "PENDING") MomoPrompt.show(ctx, capture)
                }.onFailure { Log.w(TAG, "prompt failed: ${it.message}") }
            }
            if (code == -1 || code == 429) break
            if (code == 401 && reply.contains("Capture key")) {
                // Rejected with a key that has since been replaced: go round again with the new one.
                if (p.getString("token", null) != token) continue
                // The key was turned off on the server. Keep the messages, stop until the app issues a new one, and
                // say so: otherwise capture stays off until someone happens to open the app.
                p.edit().putString("lastError", "Capture key rejected (401)").remove("token").apply()
                runCatching { MomoPrompt.notice(ctx, "Mobile money capture has stopped", "Open MoneyWise to reconnect. Your messages are kept and will be added.") }
                break
            }
            // Only an answer from the capture service itself settles a message. A login page, a redirect, a
            // "not found" from a wrong address or a proxy error is not one: keep the message and try later.
            val understood = (code in 200..299 && reply.contains("\"accepted\"")) || code == 400 || code == 409 || code == 413 || code == 422
            if (!understood && code < 500) {
                p.edit().putString("lastError", "Unexpected answer from the server ($code)").apply(); break
            }
            val failed = code >= 500
            synchronized(this) {
                val q = JSONArray(p.getString("queue", "[]"))
                val rest = JSONArray().also { out -> (1 until q.length()).forEach { out.put(q.get(it)) } }
                val attempts = head.optInt("attempts", 0) + 1
                if (failed && attempts < MAX_ATTEMPTS) rest.put(JSONObject(head.toString()).put("attempts", attempts))
                val e = p.edit().putString("queue", rest.toString())
                if (failed) e.putString("lastError", "Server error ($code)") else e.putLong("lastSentAt", System.currentTimeMillis()).remove("lastError")
                e.apply()
            }
            if (failed) break
            sent++
        }
        return sent
    }

    /** Record or dismiss a waiting capture from its prompt. Runs off the main thread; reports whether it worked. */
    fun settle(ctx: Context, captureId: String, record: Boolean, done: (Boolean) -> Unit) {
        val app = ctx.applicationContext
        io.execute {
            val p = prefs(app)
            val api = p.getString("apiUrl", null)
            val token = p.getString("token", null)
            val ok = if (api.isNullOrEmpty() || token.isNullOrEmpty()) false else try {
                // 409 = already recorded or dismissed in the app, which is the outcome the person wanted anyway.
                val code = post("$api/momo-capture/ingest/$captureId/${if (record) "post" else "dismiss"}", token, JSONObject()).first
                code in 200..299 || code == 409
            } catch (e: Exception) { Log.w(TAG, "settle failed: ${e.message}"); false }
            done(ok)
        }
    }

    /** POSTs JSON with the capture key; returns the status code and the response body. */
    private fun post(url: String, token: String, body: JSONObject): Pair<Int, String> {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; connectTimeout = 15000; readTimeout = 20000; doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("X-Capture-Token", token)
        }
        return try {
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = conn.responseCode
            val text = runCatching { (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } }.getOrNull() ?: ""
            code to text
        } finally { conn.disconnect() }
    }
}

/** Sends what is still queued once the phone has a connection again. Scheduled by MomoCapture when a send fails. */
class MomoRetryJob : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        val app = applicationContext
        MomoCapture.flushAsync(app, scheduleRetry = false) {
            jobFinished(params, MomoCapture.queued(app) > 0 && !MomoCapture.waitingForKey(app))
        }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = true
}
