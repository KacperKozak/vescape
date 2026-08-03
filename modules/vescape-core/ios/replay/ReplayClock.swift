import Foundation

/// How much of the recording plays as fast as it decodes before playback settles to 1×.
///
/// Sized to fill the live charts: it wants to cover the widest live-history window a capture or an
/// E2E run is likely to ask for, so the sparklines are already drawn when the run starts looking at
/// them. Overshooting the configured window costs nothing beyond a little decode — the surplus is
/// pruned on arrival like any other sample that has aged out.
///
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/replay/ReplayTransport.kt `REPLAY_WARMUP_MS`
/// @parity /scripts/screenshots.ts `REPLAY_WARMUP_MINUTES`
internal let replayWarmupMs: Int64 = 3 * 60_000

/// The `SessionClock` a replay runs on: wall time shifted into the past by the warmup window, then
/// driven forward as the warmup plays until it catches up with real time.
///
/// Playing the warmup faster than real time is not enough on its own to fill the live charts. Live
/// series are decimated into buckets keyed on the timestamp each sample carries, across a window
/// measured in real minutes, so a three-minute warmup dispatched in two seconds would land as two
/// seconds of samples — a sliver, not a filled window. Shifting the clock instead stamps those
/// samples across the three minutes they actually cover, and the window is genuinely full the moment
/// the warmup ends.
///
/// The offset stops moving once warmup does, leaving the session running a fixed distance behind
/// wall time for the rest of playback. Both clocks then advance at the same rate, so 1× pacing is
/// unaffected — and freezing is what keeps the timeline continuous, where snapping the offset back
/// to zero would tear a gap into every series at the warmup boundary.
///
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/replay/ReplayClock.kt
internal final class ReplayClock: SessionClock {
  private let warmupMs: Int64
  /// Read from the BLE delegate queue, the main queue and the poll timer, so the offset and the
  /// monotonic clamp are guarded. Time never running backwards is a contract the whole session
  /// leans on: ring buffers prune by comparing timestamps, and a clock that stepped back would drop
  /// samples that had only just been written.
  private let lock = NSLock()
  private var offsetMs: Int64
  private var lastNowMs = Int64.min

  init(warmupMs: Int64 = replayWarmupMs) {
    self.warmupMs = warmupMs
    self.offsetMs = -warmupMs
  }

  func nowMs() -> Int64 {
    lock.lock()
    defer { lock.unlock() }
    let candidate = Int64(Date().timeIntervalSince1970 * 1000) + offsetMs
    lastNowMs = max(lastNowMs, candidate)
    return lastNowMs
  }

  /// Advance the clock to the point in the recording the warmup has reached. Called by the
  /// transport before it dispatches each warmup event, and never again afterwards — that is what
  /// freezes the offset for the rest of playback.
  func advanceWarmup(recordedT: Int64, playbackStartedAtMs: Int64) {
    lock.lock()
    defer { lock.unlock() }
    offsetMs = playbackStartedAtMs - warmupMs + recordedT - Int64(Date().timeIntervalSince1970 * 1000)
  }
}
