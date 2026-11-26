package expo.modules.momocapture

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * "Offline · saved on phone" shown by the PHONE itself, on phones that have their own island / status-bar chip.
 *
 * Android 16 lets an app ask for an ongoing notification to be "promoted" (a Live Update): the system then shows it in
 * its own island or status-bar chip (Xiaomi HyperOS Super Island, Samsung Now Bar, Pixel's chip), styled by the phone.
 * Where that is possible the app draws nothing of its own, so the person never sees two islands. Elsewhere [supported]
 * is false and the app keeps its in-app pill.
 *
 * Everything new in Android 16 is reached by name (extras keys, reflection) so this compiles and runs on any SDK.
 */
object MomoStatusChip {
    private const val CHANNEL = "moneywise_connection"
    private const val NOTIFY_ID = 0x4D57_0FF1  // fixed: there is only ever one status
    private const val EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing"
    private const val EXTRA_SHORT_CRITICAL_TEXT = "android.shortCriticalText"

    private fun canPost(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled()
    }

    /** True when this phone will show our status in its own island / chip (Android 16+, notifications allowed, promotion allowed). */
    fun supported(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < 36 || !canPost(ctx)) return false
        return try {
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.javaClass.getMethod("canPostPromotedNotifications").invoke(nm) as? Boolean ?: false
        } catch (_: Throwable) { false }
    }

    private fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL) != null) return
        // Default importance (no sound is set on the notification itself): a promoted notification may not be MIN.
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Connection status", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Shows when MoneyWise is working offline and when it is back online"
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
        })
    }

    private fun smallIcon(ctx: Context): Int {
        val custom = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
        return if (custom != 0) custom else ctx.applicationInfo.icon
    }

    /** Shows or updates the status. [chip] is the word for the island itself ("Offline"). Returns false if nothing could be shown. */
    fun show(ctx: Context, chip: String, title: String, text: String): Boolean {
        if (!supported(ctx)) return false
        ensureChannel(ctx)
        val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val tap = open?.let { PendingIntent.getActivity(ctx, NOTIFY_ID, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(smallIcon(ctx))
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(tap)
            .build()
        n.extras.putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true)
        n.extras.putCharSequence(EXTRA_SHORT_CRITICAL_TEXT, chip)
        return try { NotificationManagerCompat.from(ctx).notify(NOTIFY_ID, n); true } catch (_: SecurityException) { false }
    }

    fun clear(ctx: Context) {
        NotificationManagerCompat.from(ctx).cancel(NOTIFY_ID)
    }
}
