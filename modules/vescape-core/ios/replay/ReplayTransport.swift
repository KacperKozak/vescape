import Foundation

/// Wall-clock tail after the last recorded chunk before the replay disconnects the session.
private let replayEndTailSeconds = 0.25

/// Dev-mode `SessionTransport` that plays a Debug Recording through the real session stack
/// (ADR 0024): fakes the connect/subscribing/ready callbacks, emits recorded `rx` chunks at their
/// recorded `t` offsets at 1× real time, swallows writes, and ends the session like a real
/// disconnect when the recording runs out. `supportsReconnect == false` keeps the controller's
/// reconnect loop out of replay: the recording ending is terminal.
///
/// Recordings are read from the on-device Debug Recording store dir (`vesc-recordings` under
/// Documents — the location iOS capture (#229) writes to).
///
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/replay/ReplayTransport.kt
internal final class ReplayTransport: SessionTransport {
  private weak var listener: VescGattListener?
  private let recordingName: String
  private var cancelled = false

  var supportsReconnect: Bool { false }

  init(recordingName: String, listener: VescGattListener) {
    self.recordingName = recordingName
    self.listener = listener
  }

  /// Directory holding on-device Debug Recordings, mirroring Android's `DebugRecordingStore` dir.
  static func recordingsDirectory() -> URL {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("vesc-recordings", isDirectory: true)
  }

  /// Resolve a recording by name with the same validation as Android's store: no path traversal,
  /// `.jsonl` only. Returns nil when invalid or missing.
  static func recordingURL(name: String) -> URL? {
    guard (name as NSString).lastPathComponent == name, name.hasSuffix(".jsonl") else { return nil }
    let url = recordingsDirectory().appendingPathComponent(name)
    return FileManager.default.fileExists(atPath: url.path) ? url : nil
  }

  func connect(peripheralId: String) {
    // Decode off-main (a ride recording can be megabytes); playback runs on the main queue.
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self else { return }
      guard
        let url = Self.recordingURL(name: self.recordingName),
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
    // Recorded `t` is relative to recording start; keeping the absolute offsets preserves the
    // original pacing (including the recorded connect handshake gap) at 1× real time.
    for chunk in chunks {
      schedule(afterMs: chunk.t) { [weak self] in
        self?.listener?.onGattFrameChunk(chunk.bytes)
      }
    }
    let endMs = chunks.last?.t ?? 0
    schedule(afterMs: endMs + Int64(replayEndTailSeconds * 1000)) { [weak self] in
      self?.listener?.onGattDisconnected(intentional: false, message: "Replay ended")
    }
  }

  private func schedule(afterMs: Int64, _ block: @escaping () -> Void) {
    DispatchQueue.main.asyncAfter(deadline: .now() + Double(afterMs) / 1000.0) { [weak self] in
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
