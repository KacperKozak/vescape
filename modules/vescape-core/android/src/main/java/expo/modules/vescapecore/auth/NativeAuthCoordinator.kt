package expo.modules.vescapecore.auth

import android.content.Context
import expo.modules.vescapecore.appstatus.AppStatusCoordinator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Reusable native authenticated HTTP boundary.
 * @parity /modules/vescape-core/ios/auth/NativeAuthCoordinator.swift
 */
class NativeAuthCoordinator(private val context: Context) {
  private val store = DeviceCredentialStore(context)
  private val client = OkHttpClient.Builder().callTimeout(10, TimeUnit.SECONDS).build()

  fun stateMap(): Map<String, Any?> {
    val credential = store.read()
    return mapOf(
      "state" to store.state().slug,
      "accountId" to credential?.accountId,
      "expiresAt" to credential?.expiresAt,
    )
  }

  suspend fun provision(
    serverUrl: String,
    token: String,
    accountId: String,
  ): Map<String, Any?> = withContext(Dispatchers.IO) {
    val candidate = DeviceCredential(serverUrl.trimEnd('/'), token, accountId, null)
    val request = authenticatedRequest(candidate, "/api/account").get().build()
    client.newCall(request).execute().use { response ->
      if (response.code == 401) {
        store.reject()
        throw IllegalStateException("Device credential rejected")
      }
      check(response.isSuccessful) { "Account verification failed (${response.code})" }
      val returnedId = response.body?.string()
        ?.let { org.json.JSONObject(it).optString("id") }
        .orEmpty()
      check(returnedId == accountId) { "Account verification mismatch" }
      store.write(candidate)
    }
    AppStatusCoordinator.get(context).refresh()
    stateMap()
  }

  suspend fun revoke() = withContext(Dispatchers.IO) {
    val credential = store.read() ?: return@withContext
    val request = authenticatedRequest(credential, "/api/auth/device-tokens/current")
      .delete()
      .build()
    client.newCall(request).execute().use { response ->
      check(response.isSuccessful || response.code == 401) {
        "Device credential revocation failed (${response.code})"
      }
    }
    store.clear()
  }

  fun clear() = store.clear()

  private fun authenticatedRequest(
    credential: DeviceCredential,
    path: String,
  ): Request.Builder = Request.Builder()
    .url("${credential.serverUrl}$path")
    .header("Authorization", "Bearer ${credential.token}")
    .header(AppStatusCoordinator.APP_VERSION_HEADER, AppStatusCoordinator.get(context).appVersion)

  companion object {
    @Volatile private var instance: NativeAuthCoordinator? = null
    fun get(context: Context): NativeAuthCoordinator =
      instance ?: synchronized(this) {
        instance ?: NativeAuthCoordinator(context.applicationContext).also { instance = it }
      }
  }
}
