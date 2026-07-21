package expo.modules.vescapecore.replay

import expo.modules.vescapecore.protocol.BmsTelemetry
import expo.modules.vescapecore.protocol.VescPacketReassembler
import expo.modules.vescapecore.protocol.parseBmsValues

import org.json.JSONObject
import java.util.Base64

/** One recorded incoming BLE chunk: milliseconds since recording start plus the raw bytes. */
internal data class ReplayChunk(val t: Long, val bytes: ByteArray)

/**
 * Pure decode core for Debug Recording replay (ADR 0024): turns a `.jsonl` Debug Recording into the
 * byte stream and decoded frames the session stack originally saw. Shared by the unit replay
 * harness (test source) and the dev-mode ReplayTransport. Only `ble-chunk` lines with
 * `direction == "rx"` matter for replay; every other kind (meta, session-state, location, tx
 * traffic) and any malformed line — real recordings can end mid-write — is skipped, never fatal.
 *
 * @parity /modules/vescape-core/ios/replay/ReplayChunkDecoder.swift
 */
internal object ReplayChunkDecoder {
    /** Recorded `rx` chunks in file order with their recorded time offsets. */
    fun rxChunks(jsonl: String): List<ReplayChunk> =
        jsonl.lineSequence().mapNotNull { line ->
            if (line.isBlank()) return@mapNotNull null
            try {
                val json = JSONObject(line)
                if (json.optString("kind") != "ble-chunk") return@mapNotNull null
                if (json.optString("direction") != "rx") return@mapNotNull null
                ReplayChunk(
                    t = json.getLong("t"),
                    bytes = Base64.getDecoder().decode(json.getString("base64")),
                )
            } catch (e: Exception) {
                null
            }
        }.toList()

    /**
     * Decoded smart-BMS frames with the recorded chunk time as `capturedAt`, produced by running the
     * recorded `rx` bytes through the real packet reassembler and BMS parser.
     */
    fun bmsFrames(jsonl: String): List<BmsTelemetry> {
        val reassembler = VescPacketReassembler()
        return rxChunks(jsonl).flatMap { chunk ->
            reassembler.feed(chunk.bytes).mapNotNull { packet -> parseBmsValues(packet, chunk.t) }
        }
    }
}
