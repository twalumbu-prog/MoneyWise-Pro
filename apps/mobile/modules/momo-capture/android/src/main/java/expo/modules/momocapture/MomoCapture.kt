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
    private const val MAX_QUEUE = 200
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

    /** Sends queued messages in order; stops at the first network failure so order and nothing is lost. */
    private fun flush(ctx: Context): Int {
        val p = prefs(ctx)
        val api = p.getString("apiUrl", null) ?: return 0
        val token = p.getString("token", null) ?: return 0
        var sent = 0
        while (true) {
            val head = synchronized(this) {
                val q = JSONArray(p.getString("queue", "[]"))
                if (q.length() == 0) null else q.getJSONObject(0)
            } ?: break
            val code = try { post("$api/momo-capture/ingest", token, head) } catch (e: Exception) {
                Log.w(TAG, "send failed: ${e.message}"); p.edit().putString("lastError", e.message ?: "network error").apply(); -1
            }
            if (code == -1 || code >= 500 || code == 429) break
            if (code == 401) {
                // The key was turned off or replaced on the server — stop until the app reconfigures us.
                p.edit().putString("lastError", "Capture key rejected (401)").remove("token").apply(); break
            }
            synchronized(this) {
                val q = JSONArray(p.getString("queue", "[]"))
                val rest = JSONArray().also { out -> (1 until q.length()).forEach { out.put(q.get(it)) } }
                p.edit().putString("queue", rest.toString()).putLong("lastSentAt", System.currentTimeMillis()).remove("lastError").apply()
            }
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
