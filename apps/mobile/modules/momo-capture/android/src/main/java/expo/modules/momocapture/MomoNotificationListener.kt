package expo.modules.momocapture

import android.app.Notification
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Sees notifications once the user grants MoneyWise "Notification access". Only the default SMS app's notifications
 * (where the title is the sender, e.g. "MoMo") and the provider apps the JS side lists are considered; chats and
 * everything else are ignored without being read further.
 */
class MomoNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val ctx = applicationContext
        if (!MomoCapture.notificationsEnabled(ctx) || sbn.packageName == ctx.packageName) return
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val fromSmsApp = sbn.packageName == Telephony.Sms.getDefaultSmsPackage(ctx)
        val fromProviderApp = sbn.packageName in MomoCapture.extraPackages(ctx)
        if (!fromSmsApp && !fromProviderApp) return

        val extras = n.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: return
        if (MomoCapture.looksLikeMomo(ctx, title, text, fromProviderApp)) {
            MomoCapture.capture(ctx, "ANDROID_NOTIFICATION", title, text, sbn.postTime)
        }
    }
}
