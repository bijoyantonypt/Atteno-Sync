package com.shifttrack.kiosk.scanner

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Encrypted on-device store for fingerprint templates (never raw images).
 * Each template is AES-256-GCM encrypted with a non-exportable Android Keystore key,
 * so copying the app's files off the device does not reveal any biometric data.
 * File layout: filesDir/templates/<employeeUuid>.bin = IV(12 bytes) || ciphertext+tag
 */
class TemplateVault(context: Context) {

    private val dir = File(context.filesDir, "templates").apply { mkdirs() }
    private val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    fun save(employeeId: String, template: ByteArray) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val tmp = File(dir, "${requireId(employeeId)}.tmp")
        tmp.writeBytes(cipher.iv + cipher.doFinal(template))
        if (!tmp.renameTo(fileFor(employeeId))) throw IllegalStateException("Could not store template")
    }

    fun loadAll(): Map<String, ByteArray> =
        dir.listFiles { f -> f.name.endsWith(".bin") }.orEmpty().associate { file ->
            val blob = file.readBytes()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, blob, 0, IV_SIZE))
            file.nameWithoutExtension to cipher.doFinal(blob, IV_SIZE, blob.size - IV_SIZE)
        }

    fun ids(): List<String> =
        dir.listFiles { f -> f.name.endsWith(".bin") }.orEmpty().map { it.nameWithoutExtension }

    fun delete(employeeId: String) {
        fileFor(employeeId).delete()
    }

    private fun fileFor(employeeId: String) = File(dir, "${requireId(employeeId)}.bin")

    // Employee ids become file names, so only canonical UUIDs are accepted (no path traversal).
    private fun requireId(id: String): String {
        if (!UUID_RE.matches(id)) throw ScannerException("BAD_EMPLOYEE_ID", "Invalid employee id")
        return id
    }

    private fun key(): SecretKey =
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey) ?: KeyGenerator
            .getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
            .apply {
                init(
                    KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setKeySize(256)
                        .build()
                )
            }
            .generateKey()

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "shifttrack_template_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_SIZE = 12
        private val UUID_RE = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    }
}
