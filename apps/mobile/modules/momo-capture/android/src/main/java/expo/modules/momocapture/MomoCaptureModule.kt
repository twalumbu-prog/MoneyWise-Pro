package expo.modules.momocapture

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.provider.Telephony
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS bridge for mobile money capture: configuration, status, the settings deep links and the SMS history import. */
class MomoCaptureModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    override fun definition() = ModuleDefinition {
        Name("MomoCapture")

        Function("configure") { options: Map<String, Any?> ->
            @Suppress("UNCHECKED_CAST")
            MomoCapture.configure(
                context,
                apiUrl = options["apiUrl"] as? String,
                token = options["token"] as? String,
                smsEnabled = options["smsEnabled"] as? Boolean ?: false,
                notificationsEnabled = options["notificationsEnabled"] as? Boolean ?: false,
                senderPattern = options["senderPattern"] as? String,
                extraPackages = (options["providerPackages"] as? List<String>) ?: emptyList(),
            )
        }

        Function("clear") { MomoCapture.clear(context) }

        Function("getStatus") {
            val p = MomoCapture.prefs(context)
            mapOf(
                "notificationAccess" to NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName),
                "smsPermission" to (ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED),
                "smsReadPermission" to (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED),
                "hasToken" to !p.getString("token", null).isNullOrEmpty(),
                "smsEnabled" to p.getBoolean("sms", false),
                "notificationsEnabled" to p.getBoolean("notifications", false),
                "queued" to MomoCapture.queued(context),
                "lastSentAt" to p.getLong("lastSentAt", 0L).takeIf { it > 0 }?.toDouble(),
                "lastError" to p.getString("lastError", null),
            )
        }

        Function("openNotificationAccessSettings") {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }

        Function("openAppSettings") {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }

        AsyncFunction("flush") { promise: Promise ->
            MomoCapture.flushAsync(context) { sent -> promise.resolve(sent) }
        }

        /** Queues matching inbox messages received since [sinceMs] (newest first, up to [max]); returns how many. */
        AsyncFunction("importSmsHistory") { sinceMs: Double, max: Int ->
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
                throw Exceptions.MissingPermissions(Manifest.permission.READ_SMS)
            }
            var count = 0
            context.contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
                "${Telephony.Sms.DATE} >= ?", arrayOf(sinceMs.toLong().toString()),
                "${Telephony.Sms.DATE} DESC",
            )?.use { c ->
                while (c.moveToNext() && count < max) {
                    val sender = c.getString(0)
                    val body = c.getString(1) ?: continue
                    if (MomoCapture.looksLikeMomo(context, sender, body)) {
                        MomoCapture.capture(context, "ANDROID_SMS", sender, body, c.getLong(2))
                        count++
                    }
                }
            }
            count
        }
    }
}
