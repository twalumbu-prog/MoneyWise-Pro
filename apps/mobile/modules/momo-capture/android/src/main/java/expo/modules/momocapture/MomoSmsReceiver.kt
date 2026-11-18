package expo.modules.momocapture

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Incoming SMS. Multi-part messages arrive as several PDUs from the same sender and are joined before matching.
 *
 * [MomoCapture.capture] sends over the network on its own background thread, which is normally fine — except a
 * BroadcastReceiver's process can be killed by Android the moment [onReceive] returns, especially when the app
 * wasn't already running (the receiver is often what starts the process in the first place). That killed the send,
 * and with it the prompt, specifically when the app was closed or minimized — the one case this exists for. `goAsync`
 * tells Android to keep the process alive a little longer; the PendingResult is finished once every match this
 * broadcast matched has actually been sent (or after a safety timeout, since that grace period is short).
 */
class MomoSmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        MomoCapture.blockedReason(context, "sms")?.let { MomoCapture.note(context, "smsSeen", "Not captured: $it"); return }
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val groups = parts.groupBy { it.originatingAddress ?: "" }
        val matches = groups.filter { (sender, msgs) -> MomoCapture.looksLikeMomo(context, sender, msgs.joinToString("") { it.messageBody ?: "" }) }
        if (matches.isEmpty()) {
            MomoCapture.note(context, "smsSeen", "Ignored: not a mobile money message")
            return
        }

        val pending = goAsync()
        val done = AtomicBoolean(false)
        val finish = { if (done.compareAndSet(false, true)) runCatching { pending.finish() } }
        var remaining = matches.size
        val oneDone = { synchronized(this) { remaining--; if (remaining <= 0) finish() } }
        // goAsync's own grace period is short (a handful of seconds) and not guaranteed; never outlast what the
        // system actually allows, whether or not every send got to run.
        Handler(Looper.getMainLooper()).postDelayed({ finish() }, 9000)

        matches.forEach { (sender, msgs) ->
            val text = msgs.joinToString("") { it.messageBody ?: "" }
            MomoCapture.note(context, "smsSeen", if (MomoCapture.waitingForKey(context)) "Kept on this phone until capture is reconnected ($sender)" else "Captured from $sender")
            MomoCapture.capture(context, "ANDROID_SMS", sender, text, msgs.first().timestampMillis, onSent = oneDone)
        }
    }
}
