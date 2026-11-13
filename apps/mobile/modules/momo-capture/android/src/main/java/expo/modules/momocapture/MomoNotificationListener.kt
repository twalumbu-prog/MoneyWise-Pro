package expo.modules.momocapture

import android.app.Notification
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Sees notifications once the user grants MoneyWise "Notification access". Only SMS apps' notifications (where the
 * title is the sender, e.g. "MoMo") and the provider apps the JS side lists are considered; chats and everything else
 * are ignored without being read further.
 */
class MomoNotificationListener : NotificationListenerService() {
    // Telephony.Sms.getDefaultSmsPackage can come back null on Android 11+ (package visibility), so the common SMS apps
    // are recognised by name as well.
    private val smsApps = setOf(
        "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms", "com.android.messaging",
        "com.transsion.message", "com.oneplus.mms", "com.coloros.mms", "com.huawei.message",
    )

    override fun onListenerConnected() { MomoCapture.note(applicationContext, "listener", "Connected") }
    override fun onListenerDisconnected() { MomoCapture.note(applicationContext, "listener", "Disconnected") }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val ctx = applicationContext
        if (sbn.packageName == ctx.packageName) return
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val defaultSms = runCatching { Telephony.Sms.getDefaultSmsPackage(ctx) }.getOrNull()
        val fromSmsApp = sbn.packageName in smsApps || sbn.packageName == defaultSms
        val fromProviderApp = sbn.packageName in MomoCapture.extraPackages(ctx)
        if (!fromSmsApp && !fromProviderApp) return
        MomoCapture.blockedReason(ctx, "notifications")?.let { MomoCapture.note(ctx, "notifSeen", "Not captured: $it"); return }

        val extras = n.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: return
        if (MomoCapture.looksLikeMomo(ctx, title, text, fromProviderApp)) {
            MomoCapture.note(ctx, "notifSeen", "Captured from $title")
            MomoCapture.capture(ctx, "ANDROID_NOTIFICATION", title, text, sbn.postTime)
        } else {
            MomoCapture.note(ctx, "notifSeen", "Ignored: not a mobile money message")
        }
    }
}
