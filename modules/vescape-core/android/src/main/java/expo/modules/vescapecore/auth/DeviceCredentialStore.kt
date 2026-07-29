package expo.modules.vescapecore.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class DeviceCredential(
  val serverUrl: String,
  val token: String,
  val accountId: String,
  val expiresAt: String?,
)

enum class DeviceCredentialState(val slug: String) {
  UNAVAILABLE("unavailable"),
  READY("ready"),
  REJECTED("rejected"),
}

/**
 * Keystore-backed Device Token storage.
 * @parity /modules/vescape-core/ios/auth/DeviceCredentialStore.swift
 */
class DeviceCredentialStore(context: Context) {
  private val preferences =
    context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  @Synchronized
  fun read(): DeviceCredential? {
    val encoded = preferences.getString(CREDENTIAL, null) ?: return null
    return try {
      val packed = Base64.decode(encoded, Base64.NO_WRAP)
      val iv = packed.copyOfRange(0, IV_BYTES)
      val ciphertext = packed.copyOfRange(IV_BYTES, packed.size)
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, iv))
      val json = JSONObject(String(cipher.doFinal(ciphertext), Charsets.UTF_8))
      DeviceCredential(
        serverUrl = json.getString("serverUrl"),
        token = json.getString("token"),
        accountId = json.getString("accountId"),
        expiresAt = json.optString("expiresAt").ifEmpty { null },
      )
    } catch (_: Exception) {
      clear()
      null
    }
  }

  @Synchronized
  fun write(credential: DeviceCredential) {
    val json = JSONObject()
      .put("serverUrl", credential.serverUrl.trimEnd('/'))
      .put("token", credential.token)
      .put("accountId", credential.accountId)
      .put("expiresAt", credential.expiresAt ?: "")
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val packed = cipher.iv + cipher.doFinal(json.toString().toByteArray(Charsets.UTF_8))
    preferences.edit()
      .putString(CREDENTIAL, Base64.encodeToString(packed, Base64.NO_WRAP))
      .putString(STATE, DeviceCredentialState.READY.slug)
      .apply()
  }

  @Synchronized
  fun updateExpiry(expiresAt: String) {
    val current = read() ?: return
    write(current.copy(expiresAt = expiresAt))
  }

  @Synchronized
  fun reject() {
    preferences.edit()
      .remove(CREDENTIAL)
      .putString(STATE, DeviceCredentialState.REJECTED.slug)
      .apply()
  }

  @Synchronized
  fun clear() {
    preferences.edit()
      .remove(CREDENTIAL)
      .putString(STATE, DeviceCredentialState.UNAVAILABLE.slug)
      .apply()
  }

  fun state(): DeviceCredentialState =
    if (read() != null) DeviceCredentialState.READY
    else DeviceCredentialState.entries.firstOrNull {
      it.slug == preferences.getString(STATE, null)
    } ?: DeviceCredentialState.UNAVAILABLE

  private fun key(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
      init(
        KeyGenParameterSpec.Builder(
          KEY_ALIAS,
          KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .build(),
      )
      generateKey()
    }
  }

  companion object {
    private const val PREFERENCES = "vescape_device_auth"
    private const val CREDENTIAL = "credential"
    private const val STATE = "state"
    private const val KEY_ALIAS = "vescape_device_auth_key"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val IV_BYTES = 12
    private const val TAG_BITS = 128
  }
}
