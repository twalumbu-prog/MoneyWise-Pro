package expo.modules.momocapture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Sees notifications once the user grants MoneyWise "Notification access".
 *
 * Deliberately does NOT gate on which app posted it. An allowlist of SMS-app package names breaks on every OEM
 * messaging app we haven't seen (MIUI, ColorOS, Xiaomi's own, a future one) — on one phone this silently meant the
 * listener never acted on anything, ever, despite being switched on, with no error anywhere to explain why. Instead
 * every notification (other than our own, and a group summary with no content) is judged purely by what it says: the
 * title must name a provider, or carry a transaction id, exactly as looksLikeMomo already requires. A message with a
 * provider's name as its title and a transaction id in its body is never a false match for anything else.
 */
class MomoNotificationListener : NotificationListenerService() {
    override fun onListenerConnected() { MomoCapture.note(applicationContext, "listener", "Connected") }
    override fun onListenerDisconnected() { MomoCapture.note(applicationContext, "listener", "Disconnected") }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val ctx = applicationContext
        if (sbn.packageName == ctx.packageName) return
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        MomoCapture.blockedReason(ctx, "notifications")?.let { MomoCapture.note(ctx, "notifSeen", "Not captured: $it"); return }

        val fromProviderApp = sbn.packageName in MomoCapture.extraPackages(ctx)
        val extras = n.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: return
        if (MomoCapture.looksLikeMomo(ctx, title, text, fromProviderApp)) {
            MomoCapture.note(ctx, "notifSeen", if (MomoCapture.waitingForKey(ctx)) "Kept on this phone until capture is reconnected ($title)" else "Captured from $title")
            MomoCapture.capture(ctx, "ANDROID_NOTIFICATION", title, text, sbn.postTime)
        } else {
            MomoCapture.note(ctx, "notifSeen", "Ignored (${sbn.packageName}): not a mobile money message")
        }
    }
}
