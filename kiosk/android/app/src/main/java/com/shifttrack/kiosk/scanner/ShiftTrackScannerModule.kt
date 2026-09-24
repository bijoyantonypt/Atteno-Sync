package com.shifttrack.kiosk.scanner

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors

/**
 * React Native bridge exposing: 1:N identification, supervised enrolment,
 * device-key signing and nonce generation. All scanner work runs on one
 * background thread so the UI never blocks and captures never overlap.
 */
class ShiftTrackScannerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val executor = Executors.newSingleThreadExecutor()
    private val driver: ScannerDriver = SecuGenDriver(reactContext)
    private val vault = TemplateVault(reactContext)

    // Decrypted templates held in memory only while the app runs (~30 x <1 KB).
    @Volatile private var templates: Map<String, ByteArray>? = null

    override fun getName() = "ShiftTrackScanner"

    private fun enrolled(): Map<String, ByteArray> = templates ?: vault.loadAll().also { templates = it }

    private fun runAsync(promise: Promise, block: () -> Any?) {
        executor.execute {
            try {
                promise.resolve(block())
            } catch (e: ScannerException) {
                if (e.code in RESET_ON) driver.close() // e.g. scanner unplugged; reopen on next call
                promise.reject(e.code, e.message, e)
            } catch (e: Exception) {
                driver.close()
                promise.reject("SCANNER_ERROR", e.message, e)
            }
        }
    }

    private fun emit(type: String, step: Int = 0) {
        val payload = Arguments.createMap().apply {
            putString("type", type)
            putInt("step", step)
        }
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_NAME, payload)
    }

    /** Captures one finger and returns the single enrolled employee it matches. */
    @ReactMethod
    fun identify(promise: Promise) = runAsync(promise) {
        driver.open()
        emit("PLACE_FINGER")
        val probe = driver.captureTemplate(CAPTURE_TIMEOUT_MS)
        val matches = enrolled().filter { (_, template) -> driver.isMatch(template, probe) }
        when (matches.size) {
            0 -> throw ScannerException("NO_MATCH", "Fingerprint not recognised")
            1 -> {
                val (employeeId, template) = matches.entries.first()
                Arguments.createMap().apply {
                    putString("employeeId", employeeId)
                    putInt("score", driver.matchScore(template, probe))
                }
            }
            // Exactly one valid match is required; ambiguity is treated as failure.
            else -> throw ScannerException("AMBIGUOUS_MATCH", "Fingerprint matched more than one person")
        }
    }

    /** Supervised enrolment: 3 captures of the same finger, stored encrypted; returns SHA-256 of the template. */
    @ReactMethod
    fun enroll(employeeId: String, promise: Promise) = runAsync(promise) {
        driver.open()
        val samples = (1..ENROLL_SAMPLES).map { step ->
            emit("ENROLL_PLACE", step)
            val template = driver.captureTemplate(CAPTURE_TIMEOUT_MS)
            emit("ENROLL_LIFT", step)
            Thread.sleep(LIFT_DELAY_MS)
            template
        }
        val primary = samples.first()
        if (samples.drop(1).any { !driver.isMatch(primary, it) }) {
            throw ScannerException("ENROLL_MISMATCH", "Captures did not match; use the same finger each time")
        }
        // Anti-proxy: one finger may belong to only one employee.
        if (enrolled().any { (id, template) -> id != employeeId && driver.isMatch(template, primary) }) {
            throw ScannerException("ALREADY_ENROLLED", "This finger is already enrolled for another employee")
        }
        vault.save(employeeId, primary)
        templates = null
        Arguments.createMap().apply { putString("templateHash", sha256Hex(primary)) }
    }

    @ReactMethod
    fun deleteTemplate(employeeId: String, promise: Promise) = runAsync(promise) {
        vault.delete(employeeId)
        templates = null
        true
    }

    @ReactMethod
    fun enrolledIds(promise: Promise) = runAsync(promise) {
        Arguments.fromList(vault.ids())
    }

    @ReactMethod
    fun getDevicePublicKey(promise: Promise) = runAsync(promise) { DeviceKey.publicKeySpki() }

    @ReactMethod
    fun sign(message: String, promise: Promise) = runAsync(promise) { DeviceKey.sign(message) }

    @ReactMethod
    fun randomNonce(promise: Promise) = runAsync(promise) { UUID.randomUUID().toString() }

    // Required by NativeEventEmitter on Android.
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    override fun invalidate() {
        executor.execute { driver.close() }
        executor.shutdown()
        super.invalidate()
    }

    private fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    companion object {
        private const val EVENT_NAME = "ShiftTrackScanner"
        private const val CAPTURE_TIMEOUT_MS = 10_000L
        private const val ENROLL_SAMPLES = 3
        private const val LIFT_DELAY_MS = 1_200L
        private val RESET_ON = setOf("NO_SCANNER", "CAPTURE_FAILED", "MATCH_FAILED")
    }
}
