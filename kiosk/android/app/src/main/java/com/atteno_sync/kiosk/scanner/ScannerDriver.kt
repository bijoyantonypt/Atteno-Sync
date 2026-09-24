package com.atteno_sync.kiosk.scanner

class ScannerException(val code: String, message: String) : Exception(message)

/**
 * Vendor-neutral fingerprint scanner contract. SecuGenDriver is the reference
 * implementation; a Mantra (MFS100) or other USB-OTG SDK can be dropped in by
 * implementing this interface without touching the JS layer.
 */
interface ScannerDriver {
    /** Opens the USB scanner. Throws NO_SCANNER / USB_PERMISSION_REQUESTED. */
    fun open()

    /** Blocks until a finger is captured (or timeout) and returns an ISO/IEC 19794-2 template. */
    fun captureTemplate(timeoutMs: Long): ByteArray

    /** True if both templates belong to the same finger at the configured security level. */
    fun isMatch(a: ByteArray, b: ByteArray): Boolean

    /** Vendor-specific similarity score, logged for audit only. */
    fun matchScore(a: ByteArray, b: ByteArray): Int

    fun close()
}

