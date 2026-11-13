package expo.modules.momocapture

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.Locale

/**
 * The prompt shown the moment a mobile money transaction is captured: "Received K250.00 from John Banda" with
 * Record and Dismiss buttons. It is posted from the native layer, so it appears with the app closed, and the buttons
 * settle the capture on the server without opening the app. Tapping the prompt itself opens the review list.
 */
object MomoPrompt {
    private const val CHANNEL = "momo_capture_prompt"
    const val ACTION_RECORD = "expo.modules.momocapture.RECORD"
    const val ACTION_DISMISS = "expo.modules.momocapture.DISMISS"
    const val EXTRA_ID = "captureId"
    const val EXTRA_TITLE = "title"

    private val PROVIDER = mapOf("MTN" to "MTN MoMo", "AIRTEL" to "Airtel Money", "ZAMTEL" to "Zamtel Kwacha")
    private fun money(v: Double) = "K" + String.format(Locale.US, "%,.2f", v)
    private fun notifyId(captureId: String) = captureId.hashCode()

    private fun canPost(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled()
    }

    private fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL) != null) return
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Mobile money transactions", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Asks whether to record a mobile money transaction as soon as it happens"
        })
    }

    private fun smallIcon(ctx: Context): Int {
        val custom = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
        return if (custom != 0) custom else ctx.applicationInfo.icon
    }

    private fun openApp(ctx: Context, requestCode: Int): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("moneywise://momo-captures")).setPackage(ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(ctx, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun action(ctx: Context, action: String, captureId: String, title: String): PendingIntent {
        val intent = Intent(ctx, MomoPromptReceiver::class.java).setAction(action).putExtra(EXTRA_ID, captureId).putExtra(EXTRA_TITLE, title)
        // Distinct request codes, or Record and Dismiss would share one PendingIntent.
        val code = notifyId(captureId) + if (action == ACTION_RECORD) 1 else 2
        return PendingIntent.getBroadcast(ctx, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** [capture] is the row the server returned from /ingest. */
    fun show(ctx: Context, capture: JSONObject) {
        val id = capture.optString("id").takeIf { it.isNotEmpty() } ?: return
        if (!canPost(ctx)) { MomoCapture.note(ctx, "prompt", "Not shown: notifications are off for MoneyWise"); return }
        ensureChannel(ctx)

        val incoming = capture.optString("direction") == "IN"
        val who = capture.optString("counterparty").takeIf { it.isNotEmpty() && it != "null" }
        val amount = money(capture.optDouble("amount", 0.0))
        val title = if (incoming) "Received $amount" + (who?.let { " from $it" } ?: "") else "Paid $amount" + (who?.let { " to $it" } ?: "")
        val wallet = PROVIDER[capture.optString("provider")] ?: "Mobile money"
        val balance = if (capture.isNull("balance_after")) null else capture.optDouble("balance_after").takeIf { !it.isNaN() }
        val text = wallet + (balance?.let { " · balance ${money(it)}" } ?: "") + ". Record this in MoneyWise?"

        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(smallIcon(ctx))
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .setContentIntent(openApp(ctx, notifyId(id)))
            .addAction(0, "Record", action(ctx, ACTION_RECORD, id, title))
            .addAction(0, "Dismiss", action(ctx, ACTION_DISMISS, id, title))
            .build()
        runCatching { NotificationManagerCompat.from(ctx).notify(notifyId(id), n) }
            .onSuccess { MomoCapture.note(ctx, "prompt", "Shown: $title") }
            .onFailure { MomoCapture.note(ctx, "prompt", "Not shown: ${it.message}") }
    }

    /** Replaces the prompt with the outcome (or with a way back into the app when the server could not be reached). */
    fun result(ctx: Context, captureId: String, title: String, record: Boolean, ok: Boolean) {
        val nm = NotificationManagerCompat.from(ctx)
        if (ok && !record) { nm.cancel(notifyId(captureId)); return }
        if (!canPost(ctx)) return
        ensureChannel(ctx)
        val text = if (ok) "Recorded in MoneyWise." else "Could not reach MoneyWise. Tap to review it in the app."
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(smallIcon(ctx))
            .setContentTitle(title)
            .setContentText(text)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setContentIntent(openApp(ctx, notifyId(captureId)))
            .apply { if (ok) setTimeoutAfter(6000) }
            .build()
        runCatching { nm.notify(notifyId(captureId), n) }
    }
}

/** The Record / Dismiss buttons on the prompt. Works with the app closed: the broadcast starts the process. */
class MomoPromptReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val record = when (intent.action) {
            MomoPrompt.ACTION_RECORD -> true
            MomoPrompt.ACTION_DISMISS -> false
            else -> return
        }
        val id = intent.getStringExtra(MomoPrompt.EXTRA_ID) ?: return
        val title = intent.getStringExtra(MomoPrompt.EXTRA_TITLE) ?: "Mobile money transaction"
        val pending = goAsync()
        val app = context.applicationContext
        MomoCapture.settle(app, id, record) { ok ->
            try { MomoPrompt.result(app, id, title, record, ok) } finally { pending.finish() }
        }
    }
}
