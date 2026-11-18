package expo.modules.tapnfc

import android.nfc.cardemulation.HostApduService
import android.os.Bundle

/**
 * Makes this phone look like an NFC tag that holds one link: the "pay me" request. Any phone that reads a tag (every Android phone,
 * and iPhones from the XS) then sees the link and opens it in MoneyWise. Nothing but the link is ever shared.
 *
 * This is the NFC Forum Type 4 tag protocol: select the NDEF application, read the capability container, select the NDEF file, read it.
 * While no request is showing the service answers "not found", so the phone is not a tag at all.
 */
class TapHceService : HostApduService() {

    companion object {
        /** NLEN (2 bytes) followed by one NDEF record holding the link. Empty when nothing is being shared. */
        @Volatile
        var ndefFile: ByteArray = ByteArray(0)

        private val AID = byteArrayOf(0xD2.toByte(), 0x76, 0x00, 0x00, 0x85.toByte(), 0x01, 0x01)
        private val CC_FILE_ID = byteArrayOf(0xE1.toByte(), 0x03)
        private val NDEF_FILE_ID = byteArrayOf(0xE1.toByte(), 0x04)
        private val OK = byteArrayOf(0x90.toByte(), 0x00)
        private val NOT_FOUND = byteArrayOf(0x6A, 0x82.toByte())
        private val BAD_OFFSET = byteArrayOf(0x6B, 0x00)
        private val UNSUPPORTED = byteArrayOf(0x6D, 0x00)

        /** Capability container: 15 bytes, NDEF file E104, up to 255 bytes, readable, not writable. */
        private val CC = byteArrayOf(
            0x00, 0x0F, 0x20, 0x00, 0x3B, 0x00, 0x34, 0x04, 0x06,
            0xE1.toByte(), 0x04, 0x00, 0xFF.toByte(), 0x00, 0xFF.toByte()
        )

        fun setUrl(url: String?) {
            ndefFile = if (url.isNullOrBlank()) ByteArray(0) else buildNdefFile(url)
        }

        /** One short NDEF "well known URI" record. The prefix byte shortens https:// to a single byte, as readers expect. */
        fun buildNdefFile(url: String): ByteArray {
            val prefix: Int
            val rest: String
            when {
                url.startsWith("https://") -> { prefix = 0x04; rest = url.substring(8) }
                url.startsWith("http://") -> { prefix = 0x03; rest = url.substring(7) }
                else -> { prefix = 0x00; rest = url }
            }
            val body = rest.toByteArray(Charsets.UTF_8)
            // A short record holds at most 255 payload bytes; our links are about 40.
            val payload = byteArrayOf(prefix.toByte()) + body.copyOf(minOf(body.size, 200))
            val record = byteArrayOf(0xD1.toByte(), 0x01, payload.size.toByte(), 0x55) + payload
            val nlen = byteArrayOf(((record.size shr 8) and 0xFF).toByte(), (record.size and 0xFF).toByte())
            return nlen + record
        }
    }

    /** 0 = nothing selected, 1 = the capability container, 2 = the NDEF file. */
    private var selected = 0

    override fun processCommandApdu(apdu: ByteArray, extras: Bundle?): ByteArray {
        val file = ndefFile
        if (file.isEmpty()) return NOT_FOUND // nothing is being shared: not a tag
        if (apdu.size < 4) return UNSUPPORTED

        return when (apdu[1]) {
            0xA4.toByte() -> select(apdu)
            0xB0.toByte() -> read(apdu, file)
            else -> UNSUPPORTED
        }
    }

    private fun select(apdu: ByteArray): ByteArray {
        if (apdu.size < 5) return NOT_FOUND
        val lc = apdu[4].toInt() and 0xFF
        if (apdu.size < 5 + lc) return NOT_FOUND
        val data = apdu.copyOfRange(5, 5 + lc)
        return when (apdu[2]) {
            0x04.toByte() -> if (data.contentEquals(AID)) { selected = 0; OK } else NOT_FOUND
            0x00.toByte() -> when {
                data.contentEquals(CC_FILE_ID) -> { selected = 1; OK }
                data.contentEquals(NDEF_FILE_ID) -> { selected = 2; OK }
                else -> NOT_FOUND
            }
            else -> NOT_FOUND
        }
    }

    private fun read(apdu: ByteArray, ndef: ByteArray): ByteArray {
        val file = when (selected) {
            1 -> CC
            2 -> ndef
            else -> return NOT_FOUND
        }
        val offset = ((apdu[2].toInt() and 0xFF) shl 8) or (apdu[3].toInt() and 0xFF)
        if (offset > file.size) return BAD_OFFSET
        val wanted = if (apdu.size > 4) (apdu[4].toInt() and 0xFF).let { if (it == 0) 256 else it } else file.size - offset
        val end = minOf(file.size, offset + wanted)
        return file.copyOfRange(offset, end) + OK
    }

    override fun onDeactivated(reason: Int) {
        selected = 0
    }
}
