package com.atteno_sync.kiosk.scanner

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * Kiosk identity: an EC P-256 key pair generated inside the Android Keystore.
 * The private key cannot be exported, so a cloned APK or copied data cannot forge
 * clock events. The backend stores only the public key (devices.public_key_spki).
 */
object DeviceKey {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val ALIAS = "atteno_sync_device_key"

    private val keyStore: KeyStore by lazy { KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) } }

    private fun ensureKey() {
        if (keyStore.containsAlias(ALIAS)) return
        KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE).apply {
            initialize(
                KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
                    .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .build()
            )
            generateKeyPair()
        }
    }

    /** Base64 X.509 SubjectPublicKeyInfo, importable with WebCrypto `importKey("spki", ...)`. */
    fun publicKeySpki(): String {
        ensureKey()
        return Base64.encodeToString(keyStore.getCertificate(ALIAS).publicKey.encoded, Base64.NO_WRAP)
    }

    /** Signs UTF-8 `message`; returns base64 IEEE-P1363 (r||s) as expected by WebCrypto ECDSA verify. */
    fun sign(message: String): String {
        ensureKey()
        val privateKey = keyStore.getKey(ALIAS, null) as PrivateKey
        val der = Signature.getInstance("SHA256withECDSA").run {
            initSign(privateKey)
            update(message.toByteArray(Charsets.UTF_8))
            sign()
        }
        return Base64.encodeToString(derToP1363(der), Base64.NO_WRAP)
    }

    /** Converts an ASN.1 DER ECDSA signature SEQUENCE{INTEGER r, INTEGER s} to fixed 64-byte r||s. */
    private fun derToP1363(der: ByteArray): ByteArray {
        var pos = 2 // SEQUENCE tag + short-form length
        if (der[1].toInt() and 0x80 != 0) pos += der[1].toInt() and 0x7f

        fun readInteger(): ByteArray {
            require(der[pos] == 0x02.toByte()) { "Malformed DER signature" }
            val len = der[pos + 1].toInt()
            val value = der.copyOfRange(pos + 2, pos + 2 + len)
            pos += 2 + len
            return value.dropWhile { it == 0.toByte() }.toByteArray() // strip sign padding
        }

        val r = readInteger()
        val s = readInteger()
        val out = ByteArray(64)
        System.arraycopy(r, 0, out, 32 - r.size, r.size)
        System.arraycopy(s, 0, out, 64 - s.size, s.size)
        return out
    }
}

