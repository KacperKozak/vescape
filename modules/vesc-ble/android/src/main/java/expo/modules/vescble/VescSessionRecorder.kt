package expo.modules.vescble

import android.content.Context
import android.util.Base64
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.io.FileWriter

internal class VescSessionRecorder(context: Context, private val boardConfig: SessionConfig) {
    private val store = DebugRecordingStore(context)
    private val startedAt = System.currentTimeMillis()
    private val writer: FileWriter
    val file: File

    init {
        file = store.createFile(boardConfig.deviceName)
        writer = FileWriter(file, false)
    }

    fun start() {
        write(
            JSONObject()
                .put("t", 0)
                .put("kind", "meta")
                .put("version", 1)
                .put("deviceName", boardConfig.deviceName)
                .put("deviceId", boardConfig.deviceId)
                .put("sessionKind", "board")
                .put("pollIntervalMs", boardConfig.pollIntervalMs)
                .put("startedAt", startedAt)
        )
        recordState("recording-started")
    }

    fun recordState(status: String, extra: Map<String, Any?> = emptyMap()) {
        val json = JSONObject()
            .put("t", elapsed())
            .put("kind", "session-state")
            .put("status", status)
        extra.forEach { (key, value) -> json.put(key, value) }
        write(json)
    }

    fun recordChunk(direction: String, bytes: ByteArray) {
        write(
            JSONObject()
                .put("t", elapsed())
                .put("kind", "ble-chunk")
                .put("direction", direction)
                .put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
        )
    }

    fun recordLocation(location: LocationSnapshot) {
        write(
            JSONObject()
                .put("t", elapsed())
                .put("kind", "location")
                .put("latitude", location.latitude)
                .put("longitude", location.longitude)
                .put("speedMps", location.speedMps)
                .put("bearingDeg", location.bearingDeg)
                .put("accuracyM", location.accuracyM)
                .put("altitudeM", location.altitudeM)
                .put("timestamp", location.timestamp)
        )
    }

    fun finish(status: String) {
        try {
            recordState(status)
            writer.flush()
            writer.close()
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Recording close failed: ${e.message}")
        }
    }

    private fun elapsed(): Long = System.currentTimeMillis() - startedAt

    private fun write(json: JSONObject) {
        try {
            writer.append(json.toString()).append('\n')
            writer.flush()
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Recording write failed: ${e.message}")
        }
    }
}

private class DebugRecordingStore(private val context: Context) {
    private val dir: File
        get() = File(context.filesDir, "vesc-recordings").also { it.mkdirs() }

    fun createFile(deviceName: String): File {
        val safeName = deviceName.replace(Regex("[^A-Za-z0-9._-]+"), "-").trim('-').ifBlank { "vesc-board" }
        return File(dir, "${System.currentTimeMillis()}-$safeName.jsonl")
    }
}
