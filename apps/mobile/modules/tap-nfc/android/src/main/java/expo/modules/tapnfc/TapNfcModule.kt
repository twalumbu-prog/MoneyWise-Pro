package expo.modules.tapnfc

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.nfc.NfcAdapter
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS bridge for tap to pay: is NFC there and on, share a link by tap, stop sharing. */
class TapNfcModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    override fun definition() = ModuleDefinition {
        Name("TapNfc")

        /** "unsupported" (no NFC or no card emulation), "off" (NFC is switched off) or "on". */
        Function("getState") {
            val hce = context.packageManager.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)
            val adapter = NfcAdapter.getDefaultAdapter(context)
            if (!hce || adapter == null) "unsupported" else if (!adapter.isEnabled) "off" else "on"
        }

        Function("setUrl") { url: String ->
            TapHceService.setUrl(url)
            true
        }

        Function("clear") {
            TapHceService.setUrl(null)
        }

        Function("openNfcSettings") {
            val intent = Intent(Settings.ACTION_NFC_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }
    }
}
