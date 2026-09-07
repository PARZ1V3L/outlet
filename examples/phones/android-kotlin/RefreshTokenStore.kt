// RefreshTokenStore.kt: the refresh token sealed with an AndroidKeyStore key (AES-GCM) before it
// touches disk. Read-checked against Android's current API documentation on 2026-09-04, not
// compiled. The key never leaves the Keystore; SharedPreferences holds IV + ciphertext, base64url.
package com.yourapp

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object RefreshTokenStore {
    private const val ALIAS = "outlet-refresh-token"
    private const val FLAGS = Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP

    fun save(context: Context, grantId: String, token: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val sealed = cipher.iv + cipher.doFinal(token.toByteArray()) // 12-byte IV, then ciphertext + tag
        prefs(context).edit().putString("grant_id", grantId) // the id is public; only the token is sealed
            .putString("refresh_token", Base64.encodeToString(sealed, FLAGS)).apply()
    }

    fun grantId(context: Context): String? = prefs(context).getString("grant_id", null)

    fun load(context: Context): String? {
        val sealed = prefs(context).getString("refresh_token", null)?.let { Base64.decode(it, FLAGS) } ?: return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, sealed, 0, 12))
        return String(cipher.doFinal(sealed, 12, sealed.size - 12))
    }

    private fun prefs(context: Context) = context.getSharedPreferences("outlet", Context.MODE_PRIVATE)

    // One key, generated on first use. The Keystore keeps it and answers only on this device.
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run { init(spec); generateKey() }
    }
}
