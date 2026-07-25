package expo.modules.vescapecore.appstatus

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit

private const val TAG = "AppStatusCoordinator"

/** One App Status fetch attempt. `null` body means "no usable response" (transport or HTTP error). */
fun interface AppStatusTransport {
  fun fetch(url: String, appVersion: String, onResult: (String?) -> Unit)
}

/**
 * Online Capability signal the Group Ride observer gates on, backed by [AppStatusCoordinator]. Kept
 * as a narrow interface so the observer can be unit-tested with a fake instead of a live fetcher.
 *
 * @platform-diff Android-only: Group Ride networking is the sole Online Capability consumer and has
 * no iOS peer, so the iOS [AppStatusCoordinator] keeps a single `onChange` sink with none of this.
 */
interface OnlineCapability {
  /** True while online work (Group Ride) is denied — Online Block or App Block. Unknown fails open. */
  val onlineBlocked: Boolean

  /** Installed marketing version to stamp on app-originated requests (WebSocket upgrades included). */
  val appVersion: String

  /** Ask for a fresh App Status now — e.g. after a server version rejection (426). */
  fun refresh()

  /** Observe App Status changes; returns a remover. Invoked on the main thread. */
  fun addListener(listener: () -> Unit): () -> Unit
}

/**
 * Process-owned App Status truth. Native reads the installed marketing version, fetches
 * `GET /api/app-status` on every foreground, and keeps the last **successful** result for the life
 * of the process.
 *
 * Failure semantics (ADR 0025):
 * - No successful result yet -> stays `null`: the app fails open and behaves as `current`.
 * - A successful result exists -> a later failure keeps it; losing the network never clears a
 *   known state.
 * - Nothing is persisted, so a fresh process starts unknown again.
 *
 * Main-thread affine, like [expo.modules.vescapecore.GroupRideObserver]: lifecycle hooks call in on
 * the main thread and the OkHttp transport posts its result back there before touching state.
 *
 * @parity /modules/vescape-core/ios/appstatus/AppStatusCoordinator.swift
 */
class AppStatusCoordinator internal constructor(
  private val installedVersion: String,
  private val baseUrl: String,
  private val transport: AppStatusTransport,
) : OnlineCapability {
  /** Last successful App Status for this process, or `null` while none has been fetched. */
  @Volatile
  var current: AppStatus? = null
    private set

  /**
   * Notified on every state change so multiple process-scoped consumers stay in sync — the JS mirror
   * (module) and the Group Ride online gate ([OnlineCapability]). Unlike the JS module, the gate can
   * outlive the foreground runtime, so it subscribes here rather than through JS.
   */
  private val listeners = CopyOnWriteArrayList<(AppStatus?) -> Unit>()

  override val onlineBlocked: Boolean
    get() = current?.version?.status?.blocksOnline ?: false

  override val appVersion: String get() = installedVersion

  /** Register a full-status listener (used by the JS mirror); returns a remover. */
  fun addChangeListener(listener: (AppStatus?) -> Unit): () -> Unit {
    listeners.add(listener)
    return { listeners.remove(listener) }
  }

  override fun addListener(listener: () -> Unit): () -> Unit = addChangeListener { listener() }

  private var refreshing = false

  /**
   * Fetch App Status now. Foreground events arrive repeatedly (and a cold start fires both create
   * and foreground), so a refresh asked for while one is already in flight is dropped — the
   * in-flight request answers it, and the next foreground picks up anything newer.
   */
  override fun refresh() {
    if (refreshing || installedVersion.isEmpty()) return
    refreshing = true
    transport.fetch("$baseUrl$APP_STATUS_PATH", installedVersion, ::onFetched)
  }

  private fun onFetched(body: String?) {
    refreshing = false
    val status = body?.let(::parseAppStatus)
    if (status == null) {
      // Fail open when nothing is known yet; keep the last success when something is. Silent by
      // design — a failed refresh is expected offline and never clears a known state.
      return
    }
    current = status
    listeners.forEach { it(status) }
  }

  companion object {
    /**
     * Public App Status route on the Vescape server.
     * @parity /modules/vescape-core/ios/appstatus/AppStatusCoordinator.swift `appStatusPath`
     */
    const val APP_STATUS_PATH = "/api/app-status"

    /**
     * Carries the installed marketing version on every app-originated request. The server resolves
     * its Release Policy ranges from it.
     * @parity /modules/vescape-core/ios/appstatus/AppStatusCoordinator.swift `appVersionHeader`
     */
    const val APP_VERSION_HEADER = "Vescape-App-Version"

    /**
     * Vescape backend origin. Native fetches App Status before JS is ready, so it cannot receive
     * the URL from JS the way Group Ride does — it holds the production origin itself.
     * @parity /modules/vescape-core/ios/appstatus/AppStatusCoordinator.swift `serverBaseUrl`
     * @parity /src/config/server.ts `SERVER_URL`
     */
    const val SERVER_BASE_URL = "https://vescape.app"

    /**
     * Stable Android download route. Server-owned redirect, so the app never hardcodes the final
     * store destination.
     * @parity /modules/vescape-core/ios/appstatus/AppStatusCoordinator.swift `iosDownloadUrl`
     */
    fun androidDownloadUrl(): String = "$SERVER_BASE_URL/download/android"

    @Volatile
    private var instance: AppStatusCoordinator? = null

    /** Process singleton — its in-memory state must outlive JS runtime reloads. */
    fun get(context: Context): AppStatusCoordinator =
      instance ?: synchronized(this) {
        instance ?: AppStatusCoordinator(
          installedVersion = installedMarketingVersion(context),
          baseUrl = SERVER_BASE_URL,
          transport = OkHttpAppStatusTransport(Handler(Looper.getMainLooper())),
        ).also { instance = it }
      }

    /**
     * Installed marketing version (`versionName`) — the same value Release Policy ranges match on
     * both platforms. Build numbers are never used.
     * @parity /modules/vescape-core/ios/appstatus/AppStatusCoordinator.swift `installedMarketingVersion`
     */
    private fun installedMarketingVersion(context: Context): String {
      val app = context.applicationContext
      return try {
        app.packageManager.getPackageInfo(app.packageName, 0).versionName.orEmpty()
      } catch (e: Exception) {
        Log.w(TAG, "Cannot read installed marketing version: ${e.message}")
        ""
      }
    }
  }
}

/** Default transport: one short-timeout GET, result handed back on the main thread. */
internal class OkHttpAppStatusTransport(private val handler: Handler) : AppStatusTransport {
  private val client = OkHttpClient.Builder()
    .callTimeout(CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
    .build()

  override fun fetch(url: String, appVersion: String, onResult: (String?) -> Unit) {
    val request = Request.Builder()
      .url(url)
      .header(AppStatusCoordinator.APP_VERSION_HEADER, appVersion)
      .build()
    client.newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        handler.post { onResult(null) }
      }

      override fun onResponse(call: Call, response: Response) {
        val body = response.use { if (it.isSuccessful) it.body?.string() else null }
        handler.post { onResult(body) }
      }
    })
  }

  private companion object {
    const val CALL_TIMEOUT_SECONDS = 10L
  }
}
