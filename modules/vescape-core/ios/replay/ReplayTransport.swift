import Foundation

/// Wall-clock tail after the last recorded chunk before the replay disconnects the session.
private let replayEndTailSeconds = 0.25

/// Dev-mode `SessionTransport` that plays a Debug Recording through the real session stack
/// (ADR 0024): fakes the connect/subscribing/ready callbacks, emits recorded `rx` chunks *and*
/// recorded GPS fixes at their recorded `t` offsets on one merged timeline, swallows writes, and
/// ends the session like a real disconnect when the recording runs out.
/// The first `replayWarmupMs` of the recording plays as fast as it decodes, against a `ReplayClock`
/// that starts that far in the past, so the session comes up with its live window already filled
/// instead of spending real minutes waiting for one; the remainder plays at 1× real time.
/// Replaying a ride means reproducing where it happened, so the recording owns position for the
/// whole session; a recording without `location` lines replays like ordinary use without a GPS fix. `supportsReconnect == false` keeps the controller's
/// reconnect loop out of replay: the recording ending is terminal.
///
/// Recordings are read from the on-device Debug Recording store dir (`DebugRecordingStore`, the
/// location iOS capture writes to).
///
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/replay/ReplayTransport.kt
/// One scheduled playback event: a board chunk or a GPS fix, ordered by recorded time.
private enum ReplayEvent {
  case chunk(ReplayChunk)
  case fix(ReplayLocation)

  var t: Int64 {
    switch self {
    case let .chunk(chunk): return chunk.t
    case let .fix(fix): return fix.t
    }
  }
}

internal final class ReplayTransport: SessionTransport {
  private weak var listener: VescGattListener?
  private let recordingName: String
  private let onLocation: (ReplayLocation) -> Void
  /// The session clock this playback drives; installed by the controller for the session.
  let clock: ReplayClock
  private let warmupMs: Int64
  private var cancelled = false
  private var playbackStartedAtMs: Int64 = 0

  var supportsReconnect: Bool { false }

  init(
    recordingName: String,
    listener: VescGattListener,
    onLocation: @escaping (ReplayLocation) -> Void,
    clock: ReplayClock,
    warmupMs: Int64 = replayWarmupMs
  ) {
    self.recordingName = recordingName
    self.listener = listener
    self.onLocation = onLocation
    self.clock = clock
    self.warmupMs = warmupMs
  }

  func connect(peripheralId: String) {
    // Decode off-main (a ride recording can be megabytes); playback runs on the main queue.
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self else { return }
      guard
        let url = ReplayRecordings.url(name: self.recordingName),
        let jsonl = try? String(contentsOf: url, encoding: .utf8)
      else {
        DispatchQueue.main.async { [weak self] in
          guard let self, !self.cancelled else { return }
          self.listener?.onGattFailure(code: "REPLAY_LOAD_FAILED", message: "Recording unreadable: \(self.recordingName)")
        }
        return
      }
      let events =
        (ReplayChunkDecoder.rxChunks(jsonl).map(ReplayEvent.chunk)
          + ReplayChunkDecoder.locations(jsonl).map(ReplayEvent.fix))
        .sorted { $0.t < $1.t }
      DispatchQueue.main.async { self.startPlayback(events) }
    }
  }

  private func startPlayback(_ events: [ReplayEvent]) {
    guard !cancelled else { return }
    listener?.onGattConnected()
    listener?.onGattSubscribing()
    listener?.onGattReady()
    playbackStartedAtMs = Int64(Date().timeIntervalSince1970 * 1000)
    scheduleNext(events, index: 0)
  }

  /// Cursor-based pacing: only the next event is ever scheduled, so an hour-long recording never
  /// floods the main queue with queued callbacks. Recorded `t` is relative to recording start;
  /// scheduling against the session clock preserves the original absolute pacing (including the
  /// recorded connect handshake gap) at 1× real time, once past the warmup window.
  private func scheduleNext(_ events: [ReplayEvent], index: Int) {
    guard !cancelled else { return }
    guard index < events.count else {
      let endMs = (events.last?.t ?? 0) + Int64(replayEndTailSeconds * 1000)
      schedule(atRecordedMs: endMs) { [weak self] in
        self?.listener?.onGattDisconnected(intentional: false, message: "Replay ended")
      }
      return
    }
    let event = events[index]
    schedule(atRecordedMs: event.t) { [weak self] in
      guard let self else { return }
      switch event {
      case let .chunk(chunk): self.listener?.onGattFrameChunk(chunk.bytes)
      case let .fix(fix): self.onLocation(fix)
      }
      self.scheduleNext(events, index: index + 1)
    }
  }

  private func schedule(atRecordedMs recordedMs: Int64, _ block: @escaping () -> Void) {
    // Warmup dispatches one event per queue hop with no delay. The cursor is what keeps that
    // bounded — enqueueing the whole window at once would starve the main queue the session needs
    // in order to process what is being dispatched into it.
    if recordedMs < warmupMs {
      clock.advanceWarmup(recordedT: recordedMs, playbackStartedAtMs: playbackStartedAtMs)
    }
    // Pace against the session clock, not wall time: the two agree exactly at 1×, and once the
    // clock freezes at the end of warmup this keeps playback resuming from the warmup boundary
    // rather than sleeping out the window the warmup just skipped.
    let delayMs = max(0, playbackStartedAtMs - warmupMs + recordedMs - clock.nowMs())
    DispatchQueue.main.asyncAfter(deadline: .now() + Double(delayMs) / 1000.0) { [weak self] in
      guard let self, !self.cancelled else { return }
      block()
    }
  }

  /// Replay swallows all writes; request/response FSMs get replies on the recording's schedule.
  @discardableResult
  func sendPayload(_ payload: [UInt8]) -> Bool { !cancelled }

  func disconnect() { cancelled = true }
  func reconnect() {}
  func startReconnectScan() {}
  func stopReconnectScan() {}
}
