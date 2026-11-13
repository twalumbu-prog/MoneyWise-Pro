package expo.modules.momocapture

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
    private val MONEY_HINT = Regex("(?i)(\\b(ZMW|ZK)\\s?[0-9]|(?<![A-Za-z0-9])K\\s?[0-9]|\\b(amount|amt)\\b)")

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
        return (sender != null && re.containsMatchIn(sender)) || (fromProviderApp && re.containsMatchIn(text))
    }

    private fun digest(text: String): String {
        val norm = text.lowercase().replace(Regex("[^a-z0-9.]"), "")
        return MessageDigest.getInstance("SHA-256").digest(norm.toByteArray()).joinToString("") { "%02x".format(it) }.take(24)
    }

    /** Queues a message (dropping one already seen — the SMS and its notification are the same message) and sends. */
    fun capture(ctx: Context, source: String, sender: String?, text: String, occurredAtMs: Long) {
        val p = prefs(ctx)
        synchronized(this) {
            val key = digest(text)
            val seen = JSONArray(p.getString("seen", "[]"))
            for (i in 0 until seen.length()) if (seen.getString(i) == key) return
            seen.put(key)
            val trimmedSeen = JSONArray().also { out -> (maxOf(0, seen.length() - 100) until seen.length()).forEach { out.put(seen.getString(it)) } }

            val queue = JSONArray(p.getString("queue", "[]"))
            queue.put(JSONObject().put("source", source).put("sender", sender ?: JSONObject.NULL).put("text", text).put("occurredAt", occurredAtMs))
            val trimmedQueue = JSONArray().also { out -> (maxOf(0, queue.length() - MAX_QUEUE) until queue.length()).forEach { out.put(queue.get(it)) } }
            p.edit().putString("seen", trimmedSeen.toString()).putString("queue", trimmedQueue.toString()).apply()
        }
        flushAsync(ctx)
    }

    fun queued(ctx: Context): Int = runCatching { JSONArray(prefs(ctx).getString("queue", "[]")).length() }.getOrDefault(0)

    fun flushAsync(ctx: Context, done: ((Int) -> Unit)? = null) {
        val app = ctx.applicationContext
        io.execute { val sent = flush(app); done?.invoke(sent) }
    }

    /** What a listener last saw and did with it, so the app can show why nothing is arriving. */
    fun note(ctx: Context, kind: String, result: String) {
        prefs(ctx).edit().putLong(kind + "At", System.currentTimeMillis()).putString(kind + "Result", result).apply()
    }

    /** Why a source ("sms" / "notifications") is not capturing right now, or null when it is. */
    fun blockedReason(ctx: Context, source: String): String? = when {
        !prefs(ctx).getBoolean(source, false) -> "switched off"
        !hasToken(ctx) -> "no capture key"
        else -> null
    }

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
            val body = JSONObject(head.toString()).apply { remove("attempts") }
            val code = try { post("$api/momo-capture/ingest", token, body) } catch (e: Exception) {
                Log.w(TAG, "send failed: ${e.message}"); p.edit().putString("lastError", e.message ?: "network error").apply(); -1
            }
            if (code == -1 || code == 429) break
            if (code == 401) {
                // Rejected with a key that has since been replaced: go round again with the new one.
                if (p.getString("token", null) != token) continue
                // The key was turned off on the server. Stop until the app issues a new one.
                p.edit().putString("lastError", "Capture key rejected (401)").remove("token").apply(); break
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

    private fun post(url: String, token: String, body: JSONObject): Int {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; connectTimeout = 15000; readTimeout = 20000; doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("X-Capture-Token", token)
        }
        return try {
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            conn.responseCode
        } finally { conn.disconnect() }
    }
}
