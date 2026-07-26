import Foundation

/// One recorded incoming BLE chunk: milliseconds since recording start plus the raw bytes.
internal struct ReplayChunk {
  let t: Int64
  let bytes: [UInt8]
}

/// Pure decode core for Debug Recording replay (ADR 0024): turns a `.jsonl` Debug Recording into the
/// byte stream and decoded frames the session stack originally saw. Shared by the unit replay
/// harness (test source) and the dev-mode ReplayTransport. Only `ble-chunk` lines with
/// `direction == "rx"` matter for replay; every other kind (meta, session-state, location, tx
/// traffic) and any malformed line — real recordings can end mid-write — is skipped, never fatal.
///
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/replay/ReplayChunkDecoder.kt
internal enum ReplayChunkDecoder {
  /// Recorded `rx` chunks in file order with their recorded time offsets.
  static func rxChunks(_ jsonl: String) -> [ReplayChunk] {
    jsonl.split(separator: "\n").compactMap { line in
      guard
        let data = line.data(using: .utf8),
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
        json["kind"] as? String == "ble-chunk",
        json["direction"] as? String == "rx",
        let t = (json["t"] as? NSNumber)?.int64Value,
        let base64 = json["base64"] as? String,
        let bytes = Data(base64Encoded: base64)
      else { return nil }
      return ReplayChunk(t: t, bytes: [UInt8](bytes))
    }
  }

  /// Decoded smart-BMS frames with the recorded chunk time as `capturedAt`, produced by running the
  /// recorded `rx` bytes through the real packet reassembler and BMS parser.
  static func bmsFrames(_ jsonl: String) -> [BmsTelemetry] {
    let reassembler = VescPacketReassembler()
    return rxChunks(jsonl).flatMap { chunk in
      reassembler.feed(chunk.bytes).compactMap { packet in parseBmsValues(packet, packetAt: chunk.t) }
    }
  }
}
