package expo.modules.momocapture

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/** Incoming SMS. Multi-part messages arrive as several PDUs from the same sender and are joined before matching. */
class MomoSmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION || !MomoCapture.smsEnabled(context)) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        parts.groupBy { it.originatingAddress ?: "" }.forEach { (sender, msgs) ->
            val text = msgs.joinToString("") { it.messageBody ?: "" }
            if (MomoCapture.looksLikeMomo(context, sender, text)) {
                MomoCapture.capture(context, "ANDROID_SMS", sender, text, msgs.first().timestampMillis)
            }
        }
    }
}
