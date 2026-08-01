package expo.modules.vescapecore.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import expo.modules.vescapecore.api.HttpMethod
import expo.modules.vescapecore.api.VescapeApi
import expo.modules.vescapecore.appstatus.AppStatusCoordinator
import expo.modules.vescapecore.auth.DeviceCredentialStore
import expo.modules.vescapecore.telemetry.DatabaseBackupManager
import expo.modules.vescapecore.telemetry.TelemetryDatabase
import expo.modules.vescapecore.telemetry.TelemetryRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private const val TAG = "SyncCoordinator"

/** What JS renders. Native owns every transition; JS only asks and shows. */
data class SyncStatus(
  val accountId: String?,
  val pendingRows: Int,
  val pause: SyncPauseReason?,
  val lastUploadAtMs: Long?,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "accountId" to accountId,
    "pendingRows" to pendingRows,
    "pause" to pause?.slug,
    "lastUploadAtMs" to lastUploadAtMs,
  )
}

/**
 * The uploader's lifecycle: the loop, the kicks, and the Account binding it runs under.
 *
 * Runs inside the window the app already keeps alive — the foreground service during a Board Session
 * or GPS, the existing background modes on iOS. Deliberately no `WorkManager`: a ride that ends
 * offline on a phone that is never reopened waits for the next app open or the next ride.
 *
 * @parity /modules/vescape-core/ios/sync/SyncCoordinator.swift
 */
class SyncCoordinator private constructor(private val context: Context) {
  /** Resolved per call: an Account reset replaces the whole database file under this object. */
  private val dao get() = TelemetryDatabase.get(context).telemetryDao()
  private val credentials = DeviceCredentialStore(context)
  private val scope = CoroutineScope(SupervisorJob())

  /** Bumped by an Account reset; a response captured under an older value cannot commit. */
  @Volatile private var generation = 0L

  @Volatile private var lastSamplePersistedAtMs = 0L
  @Volatile private var lastUploadAtMs: Long? = null
  @Volatile private var wifiOnly = false

  /** Failure keys already recorded this process, so a wedged batch writes one event, not a stream. */
  private val recordedFailures = HashSet<String>()

  private var loop: Job? = null

  /** Kicks in flight, so [stop] leaves nothing running against a database about to be replaced. */
  private val kicks = java.util.concurrent.CopyOnWriteArrayList<Job>()

  /** Serializes passes against each other and against [resetForAccount]. */
  private val passLock = Mutex()

  private val store = SyncStore(
    database = { dao },
    generation = { generation },
    onPermanentFailure = ::recordPermanentFailure,
  )

  private val engine = SyncEngine(
    source = store,
    transport = ::post,
    environment = ::environment,
  )

  val pauseReason: SyncPauseReason? get() = engine.pauseReason

  /** Recording persisted samples: the ride cadence follows sample production, not session presence. */
  fun notifySamplesPersisted(atMs: Long = System.currentTimeMillis()) {
    lastSamplePersistedAtMs = atMs
  }

  fun setWifiOnly(enabled: Boolean) {
    wifiOnly = enabled
    kick()
  }

  suspend fun status(): SyncStatus = SyncStatus(
    accountId = dao.getBoundAccountId(),
    pendingRows = store.pendingCount(),
    pause = engine.pauseReason,
    lastUploadAtMs = lastUploadAtMs,
  )

  /**
   * Pick the uploader back up on a cold launch: the credential outlives the process, so a phone that
   * was signed in stays signed in, and nothing else would ever start the loop again. Binding the
   * stored Account is a no-op when this database already belongs to it, and cannot claim a database
   * that belongs to another one.
   */
  fun resumeIfBound() {
    val credential = credentials.read() ?: return
    scope.launch {
      if (bindAccount(credential.accountId)) start()
    }
  }

  fun start() {
    if (loop?.isActive == true) return
    loop = scope.launch {
      while (isActive) {
        val waitMs = try {
          pass()
        } catch (e: Exception) {
          Log.w(TAG, "Sync pass failed: ${e.message}")
          SyncPolicy.IDLE_INTERVAL_MS
        }
        delay(waitMs)
      }
    }
  }

  /** Stops the loop and every kick in flight, so nothing is left running over a replaced database. */
  fun stop() {
    loop?.cancel()
    loop = null
    kicks.forEach { it.cancel() }
    kicks.clear()
  }

  /** Connectivity regained, ride ended, sign-in: send now rather than waiting for the next tick. */
  fun kick() {
    if (loop?.isActive != true) return start()
    val job = scope.launch { runCatching { pass() } }
    kicks.add(job)
    job.invokeOnCompletion { kicks.remove(job) }
  }

  /**
   * One pass, draining while the server keeps accepting: a `200` with rows still pending sends again
   * straight away, so a long backlog drains instead of trickling.
   *
   * Serialized against every other pass and against an Account reset: the whole scan → send →
   * commit sequence holds the lock, so a reset can never land between reading a previous Account's
   * rows and checkpointing them onto the fresh database.
   */
  private suspend fun pass(): Long = passLock.withLock {
    var drains = 0
    while (drains < MAX_DRAIN_STEPS) {
      when (val outcome = engine.runOnce()) {
        is SyncPass.Sent -> {
          lastUploadAtMs = System.currentTimeMillis()
          if (!outcome.morePending) return interval()
          drains += 1
        }
        // Nothing was accepted, but the next attempt differs — a narrowed byte target.
        SyncPass.Retry -> drains += 1
        is SyncPass.Waiting ->
          return (outcome.untilMs - System.currentTimeMillis()).coerceIn(0, SyncPolicy.BACKOFF_MAX_MS)
        is SyncPass.Paused -> return SyncPolicy.IDLE_INTERVAL_MS
        SyncPass.Idle -> return interval()
      }
    }
    // A drain that never finishes yields rather than spinning; the next tick resumes it.
    return SyncPolicy.RIDE_INTERVAL_MS
  }

  private fun interval(): Long =
    if (samplesProducing()) SyncPolicy.RIDE_INTERVAL_MS else SyncPolicy.IDLE_INTERVAL_MS

  private fun samplesProducing(): Boolean =
    System.currentTimeMillis() - lastSamplePersistedAtMs < SAMPLE_ACTIVITY_WINDOW_MS

  private fun environment(): SyncEnvironment {
    val capabilities = runCatching {
      val manager = context.getSystemService(ConnectivityManager::class.java)
      manager?.getNetworkCapabilities(manager.activeNetwork)
    }.getOrNull()
    return SyncEnvironment(
      ridingSamples = samplesProducing(),
      online = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true,
      wifiOnly = wifiOnly,
      onWifi = capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true,
      credentialReady = credentials.read() != null,
      onlineBlocked = AppStatusCoordinator.get(context).onlineBlocked,
    )
  }

  /**
   * The Sync endpoints are Online Capabilities behind the App Status gate, and they authenticate with
   * the shared Device Token, so the whole call goes through [VescapeApi].
   */
  private suspend fun post(body: String): SyncResponse {
    val api = VescapeApi.forOrigin(context, AppStatusCoordinator.serverBaseUrl(context))
    val response = api.exchange(HttpMethod.POST, SYNC_PATH, body)
      ?: return SyncResponse.Transient("network")
    return when {
      response.status == 200 -> SyncResponse.Accepted(response.body)
      response.status == 401 -> SyncResponse.Unauthorized
      response.status == 413 -> SyncResponse.TooLarge
      response.status == 429 -> SyncResponse.RateLimited(retryAfterMs(response.headers))
      response.status >= 500 -> SyncResponse.Transient("http ${response.status}")
      response.status >= 400 -> SyncResponse.Invalid(response.status, errorSlug(response.body))
      // A `2xx` that is not the accepted map is a protocol failure, not a success to interpret.
      else -> SyncResponse.Invalid(response.status, "unexpected-success")
    }
  }

  /** The server's own delay in seconds, or the first backoff step when it named none. */
  private fun retryAfterMs(headers: Map<String, String>): Long =
    headers["retry-after"]?.trim()?.toLongOrNull()?.times(1_000L) ?: SyncPolicy.BACKOFF_START_MS

  private fun errorSlug(body: String): String =
    Regex("\"error\"\\s*:\\s*\"([^\"]+)\"").find(body)?.groupValues?.get(1) ?: "invalid-request"

  // Account binding — the Device Token exchange returns a stable server Account id, and the first
  // Account claims this database.

  /**
   * Claim the local database for [accountId] when it is unbound or already belongs to it.
   *
   * False means a different Account: cursors are deliberately not reset over the existing rows,
   * because that would upload the previous Account's Boards, Ride History, locations and settings to
   * the new one. The Rider has to confirm the destructive reset first.
   */
  suspend fun bindAccount(accountId: String): Boolean {
    val bound = dao.bindAccount(accountId)
    if (bound) {
      engine.resume()
      kick()
    }
    return bound
  }

  /**
   * The Account change transition, in the one order that cannot leak data between Accounts: stop the
   * loop, invalidate in-flight work, replace the database, clear cursors and pending actions, bind
   * the new Account, then start again.
   *
   * The wipe is local maintenance and emits no Sync Actions to either Account — replacing the file
   * removes the log with everything else.
   */
  suspend fun resetForAccount(accountId: String) {
    stop()
    // Held across the whole transition: a pass that started before `stop()` finishes its scan, send
    // and commit against the old database before the file is replaced, and none can start midway.
    passLock.withLock {
      // Every in-flight response now belongs to a previous Account and can no longer commit.
      generation += 1
      recordedFailures.clear()
      DatabaseBackupManager.replaceWithFreshDatabase(context)
      check(dao.bindAccount(accountId)) { "Fresh database did not accept the new Account" }
      engine.resume()
      lastUploadAtMs = null
    }
    // Deliberately not started here: the caller installs the new Device Token first, so the loop
    // never runs with the previous Account's credential against the new Account's database.
  }

  /**
   * One coalesced Diagnostic Event per failure class, table and cursor. Metadata only: an error
   * code, a table, a cursor and the app version — never row contents, coordinates, the Device Token,
   * the server body or an opaque database error.
   */
  private fun recordPermanentFailure(reason: SyncPauseReason, detail: String) {
    val key = "${reason.slug}:$detail"
    synchronized(recordedFailures) {
      if (!recordedFailures.add(key)) return
    }
    TelemetryRepository.get(context).recordDiagnosticEvent(
      "sync_upload_paused",
      mapOf(
        "operation" to "sync",
        "phase" to reason.slug,
        "message" to "Sync upload paused",
        "sync_failure" to reason.slug,
        "sync_detail" to detail,
        "app_version" to AppStatusCoordinator.get(context).appVersion,
      ),
    )
  }

  companion object {
    internal const val SYNC_PATH = "/api/sync"

    /** Samples persisted this recently mean a ride is producing, Idle Pause included. */
    private const val SAMPLE_ACTIVITY_WINDOW_MS = 60_000L

    /** A drain is a burst, not a loop that can never yield to the rest of the process. */
    private const val MAX_DRAIN_STEPS = 50

    @Volatile private var instance: SyncCoordinator? = null

    fun get(context: Context): SyncCoordinator =
      instance ?: synchronized(this) {
        instance ?: SyncCoordinator(context.applicationContext).also { instance = it }
      }
  }
}
