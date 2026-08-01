package expo.modules.vescapecore.sync

/** How the uploader ran out of road. A paused engine is not woken by ordinary timer kicks. */
enum class SyncPauseReason(val slug: String) {
  /** No Device Token, or the server rejected the one we hold. Sign-in is the only way out. */
  AUTHENTICATION("authentication"),

  /** The server refused this batch on its contents, or answered `2xx` with something unreadable. */
  PROTOCOL("protocol"),

  /** A single row cannot fit inside the wire byte cap. Retained, never skipped. */
  ROW_TOO_LARGE("rowTooLarge"),
}

/** What the loop should do next. */
sealed interface SyncDecision {
  /** Send the next batch now. */
  object SendNow : SyncDecision

  /** Nothing to do until [atMs]; the loop re-decides then or when a kick lands. */
  data class Wait(val atMs: Long) : SyncDecision

  /** Stopped until the named condition changes. Timer and connectivity kicks do not bypass it. */
  data class Paused(val reason: SyncPauseReason) : SyncDecision
}

/**
 * Everything the decision depends on, read once by the caller so the decision itself stays pure.
 *
 * @parity /modules/vescape-core/ios/sync/SyncPolicy.swift `SyncState`
 */
data class SyncState(
  val nowMs: Long,
  /** Rows waiting across every table. Zero means idle, not finished. */
  val pendingRows: Int,
  /** A Board Session is producing samples — Idle Pause halts production without ending the session. */
  val ridingSamples: Boolean,
  val online: Boolean,
  /** Metered-connection setting; the uploader waits for Wi-Fi rather than failing. */
  val wifiOnly: Boolean,
  val onWifi: Boolean,
  val credentialReady: Boolean,
  /** The App Status gate closed, like every other Online Capability. */
  val onlineBlocked: Boolean,
  /** Set by a permanent failure; cleared only by sign-in or an Account reset. */
  val pause: SyncPauseReason?,
  /** Backoff or `Retry-After` deadline; before it, nothing is sent. */
  val retryAtMs: Long,
)

/**
 * The one place that turns state into "send, wait, or stopped".
 *
 * Pure: no database, no clock, no network. The clock is [SyncState.nowMs] and the caller owns it.
 *
 * @parity /modules/vescape-core/ios/sync/SyncPolicy.swift `SyncPolicy`
 */
object SyncPolicy {
  /** Cadence while a ride is producing samples: a crash loses at most this much. */
  const val RIDE_INTERVAL_MS = 30_000L

  /** Cadence when nothing is pending. Cheap, because it is a no-op. */
  const val IDLE_INTERVAL_MS = 5 * 60_000L

  const val BACKOFF_START_MS = 30_000L
  const val BACKOFF_MAX_MS = 15 * 60_000L

  fun decide(state: SyncState): SyncDecision {
    state.pause?.let { return SyncDecision.Paused(it) }
    if (!state.credentialReady) return SyncDecision.Paused(SyncPauseReason.AUTHENTICATION)

    val interval = if (state.ridingSamples) RIDE_INTERVAL_MS else IDLE_INTERVAL_MS
    if (state.pendingRows <= 0) return SyncDecision.Wait(state.nowMs + interval)
    // Offline, metered, or gated: a pause in the loop, never a failure that moves backoff.
    if (!state.online || state.onlineBlocked) return SyncDecision.Wait(state.nowMs + interval)
    if (state.wifiOnly && !state.onWifi) return SyncDecision.Wait(state.nowMs + interval)
    if (state.retryAtMs > state.nowMs) return SyncDecision.Wait(state.retryAtMs)
    return SyncDecision.SendNow
  }

  /** Next backoff step: doubling from [BACKOFF_START_MS], capped, and reset to 0 on success. */
  fun nextBackoffMs(previousMs: Long): Long = when {
    previousMs <= 0L -> BACKOFF_START_MS
    else -> minOf(previousMs * 2, BACKOFF_MAX_MS)
  }
}
