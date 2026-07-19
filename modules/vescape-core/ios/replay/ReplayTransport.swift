import Foundation

/// Wall-clock tail after the last recorded chunk before the replay disconnects the session.
private let replayEndTailSeconds = 0.25

/// Dev-mode `SessionTransport` that plays a Debug Recording through the real session stack
/// (ADR 0024): fakes the connect/subscribing/ready callbacks, emits recorded `rx` chunks at their
/// recorded `t` offsets at 1× real time, swallows writes, and ends the session like a real
/// disconnect when the recording runs out. `supportsReconnect == false` keeps the controller's
/// reconnect loop out of replay: the recording ending is terminal.
///
/// Recordings are read from the on-device Debug Recording store dir (`DebugRecordingStore`, the
/// location iOS capture writes to).
///
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/replay/ReplayTransport.kt
internal final class ReplayTransport: SessionTransport {
  private weak var listener: VescGattListener?
  private let recordingName: String
  private var cancelled = false
  private var playbackStartedAt = DispatchTime.now()

  var supportsReconnect: Bool { false }

  init(recordingName: String, listener: VescGattListener) {
    self.recordingName = recordingName
    self.listener = listener
  }

  func connect(peripheralId: String) {
    // Decode off-main (a ride recording can be megabytes); playback runs on the main queue.
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self else { return }
      guard
        let url = ReplayRecordings.url(name: self.recordingName),
        let jsonl = try? String(contentsOf: url, encoding: .utf8)
      else {
        DispatchQueue.main.async {
          self.listener?.onGattFailure(code: "REPLAY_LOAD_FAILED", message: "Recording unreadable: \(self.recordingName)")
        }
        return
      }
      let chunks = ReplayChunkDecoder.rxChunks(jsonl)
      DispatchQueue.main.async { self.startPlayback(chunks) }
    }
  }

  private func startPlayback(_ chunks: [ReplayChunk]) {
    guard !cancelled else { return }
    listener?.onGattConnected()
    listener?.onGattSubscribing()
    listener?.onGattReady()
    playbackStartedAt = DispatchTime.now()
    scheduleNext(chunks, index: 0)
  }

  /// Cursor-based pacing: only the next chunk is ever scheduled, so an hour-long recording never
  /// floods the main queue with queued callbacks. Recorded `t` is relative to recording start;
  /// scheduling against `playbackStartedAt` preserves the original absolute pacing (including the
  /// recorded connect handshake gap) at 1× real time.
  private func scheduleNext(_ chunks: [ReplayChunk], index: Int) {
    guard !cancelled else { return }
    guard index < chunks.count else {
      let endMs = (chunks.last?.t ?? 0) + Int64(replayEndTailSeconds * 1000)
      schedule(atRecordedMs: endMs) { [weak self] in
        self?.listener?.onGattDisconnected(intentional: false, message: "Replay ended")
      }
      return
    }
    let chunk = chunks[index]
    schedule(atRecordedMs: chunk.t) { [weak self] in
      self?.listener?.onGattFrameChunk(chunk.bytes)
      self?.scheduleNext(chunks, index: index + 1)
    }
  }

  private func schedule(atRecordedMs recordedMs: Int64, _ block: @escaping () -> Void) {
    let deadline = playbackStartedAt + Double(recordedMs) / 1000.0
    DispatchQueue.main.asyncAfter(deadline: max(deadline, .now())) { [weak self] in
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
