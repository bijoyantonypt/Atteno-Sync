package com.atteno_sync.kiosk.scanner

import SecuGen.FDxSDKPro.JSGFPLib
import SecuGen.FDxSDKPro.SGDeviceInfoParam
import SecuGen.FDxSDKPro.SGFDxDeviceName
import SecuGen.FDxSDKPro.SGFDxErrorCode
import SecuGen.FDxSDKPro.SGFDxSecurityLevel
import SecuGen.FDxSDKPro.SGFDxTemplateFormat
import SecuGen.FDxSDKPro.SGFingerInfo
import SecuGen.FDxSDKPro.SGImpressionType
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbManager
import android.os.Build

/**
 * SecuGen USB-OTG driver (e.g. Hamster Pro 20) built on the free "FDx SDK Pro for Android".
 * Class and method names follow SecuGen's Android sample (JSGDActivity); confirm them
 * against the SDK version you download, as SecuGen occasionally changes signatures.
 * The SDK jar goes in android/app/libs and its .so files in android/app/src/main/jniLibs.
 */
class SecuGenDriver(private val context: Context) : ScannerDriver {

    private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private var lib: JSGFPLib? = null
    private var imageWidth = 0
    private var imageHeight = 0
    private var maxTemplateSize = 0

    override fun open() {
        if (lib != null) return
        val sdk = JSGFPLib(context, usbManager)
        ensure(sdk.Init(SGFDxDeviceName.SG_DEV_AUTO), "NO_SCANNER", "Scanner not found")

        val device = sdk.GetUsbDevice()
        if (device == null) {
            sdk.Close()
            throw ScannerException("NO_SCANNER", "Scanner not connected")
        }
        if (!usbManager.hasPermission(device)) {
            // One-time prompt; with usb_device_filter.xml + "Always open" it is not shown again.
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
            val intent = Intent(ACTION_USB_PERMISSION).setPackage(context.packageName)
            usbManager.requestPermission(device, PendingIntent.getBroadcast(context, 0, intent, flags))
            sdk.Close()
            throw ScannerException("USB_PERMISSION_REQUESTED", "Allow USB access, then try again")
        }

        ensure(sdk.OpenDevice(0L), "NO_SCANNER", "Could not open scanner")
        val info = SGDeviceInfoParam()
        ensure(sdk.GetDeviceInfo(info), "NO_SCANNER", "Could not read scanner info")
        imageWidth = info.imageWidth
        imageHeight = info.imageHeight
        ensure(sdk.SetTemplateFormat(SGFDxTemplateFormat.TEMPLATE_FORMAT_ISO19794), "NO_SCANNER", "Template format unsupported")
        val size = IntArray(1)
        sdk.GetMaxTemplateSize(size)
        maxTemplateSize = size[0]
        lib = sdk
    }

    override fun captureTemplate(timeoutMs: Long): ByteArray {
        val sdk = lib ?: throw ScannerException("NO_SCANNER", "Scanner not open")
        val image = ByteArray(imageWidth * imageHeight) // raw image stays in RAM only and is discarded

        val err = sdk.GetImageEx(image, timeoutMs, MIN_IMAGE_QUALITY.toLong())
        if (err == SGFDxErrorCode.SGFDX_ERROR_TIME_OUT) throw ScannerException("TIMEOUT", "No finger detected")
        ensure(err, "CAPTURE_FAILED", "Capture failed")

        val quality = IntArray(1)
        sdk.GetImageQuality(imageWidth.toLong(), imageHeight.toLong(), image, quality)
        if (quality[0] < MIN_IMAGE_QUALITY) throw ScannerException("LOW_QUALITY", "Press the finger flat and try again")

        val finger = SGFingerInfo().apply {
            FingerNumber = 1
            ImageQuality = quality[0]
            ImpressionType = SGImpressionType.SG_IMPTYPE_LP
            ViewNumber = 1
        }
        val template = ByteArray(maxTemplateSize)
        ensure(sdk.CreateTemplate(finger, image, template), "CAPTURE_FAILED", "Could not create template")
        image.fill(0)

        val actualSize = IntArray(1)
        sdk.GetTemplateSize(template, actualSize)
        return template.copyOf(actualSize[0])
    }

    override fun isMatch(a: ByteArray, b: ByteArray): Boolean {
        val sdk = lib ?: throw ScannerException("NO_SCANNER", "Scanner not open")
        val matched = BooleanArray(1)
        ensure(sdk.MatchTemplate(a, b, SGFDxSecurityLevel.SL_NORMAL, matched), "MATCH_FAILED", "Matching failed")
        return matched[0]
    }

    override fun matchScore(a: ByteArray, b: ByteArray): Int {
        val sdk = lib ?: return 0
        val score = IntArray(1)
        sdk.GetMatchingScore(a, b, score)
        return score[0]
    }

    override fun close() {
        lib?.let {
            it.CloseDevice()
            it.Close()
        }
        lib = null
    }

    private fun ensure(result: Long, code: String, message: String) {
        if (result != SGFDxErrorCode.SGFDX_ERROR_NONE) throw ScannerException(code, "$message (SecuGen error $result)")
    }

    companion object {
        const val ACTION_USB_PERMISSION = "com.atteno_sync.kiosk.USB_PERMISSION"
        private const val MIN_IMAGE_QUALITY = 50
    }
}

