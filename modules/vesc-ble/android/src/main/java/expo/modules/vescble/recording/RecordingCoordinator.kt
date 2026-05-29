package expo.modules.vescble.recording

import android.content.Context
import expo.modules.vescble.LocationSnapshot
import expo.modules.vescble.SessionConfig
import expo.modules.vescble.VescSessionRecorder
import expo.modules.vescble.telemetry.AppDataRepository
import expo.modules.vescble.telemetry.AppSettings
import expo.modules.vescble.telemetry.TelemetryCapture
import expo.modules.vescble.telemetry.TelemetryRepository

internal class RecordingCoordinator(
    private val context: Context,
    private val applyLiveSettings: (AppSettings) -> Unit,
) {
    private var recorder: VescSessionRecorder? = null
    private var telemetryStore: TelemetryRepository? = null
    private var connectionLostMarkerAt: Long? = null

    val telemetryRecordingEnabled: Boolean
        get() = telemetryStore != null

    companion object {
        @Volatile
        private var requestedTelemetryRecordingEnabled = false

        fun requestTelemetryRecording(enabled: Boolean) {
            requestedTelemetryRecordingEnabled = enabled
        }
    }

    fun currentRecorder(): VescSessionRecorder? = recorder

    fun beginBoardSession(config: SessionConfig) {
        connectionLostMarkerAt = null
        recorder = if (config.recordingEnabled) {
            VescSessionRecorder(context, config).also { it.start() }
        } else {
            null
        }
        telemetryStore = if (config.telemetryRecordingEnabled || requestedTelemetryRecordingEnabled) {
            configuredTelemetryStore()
        } else {
            null
        }
    }

    fun markBoardReady(config: SessionConfig) {
        connectionLostMarkerAt = null
        val autoRecording = try {
            kotlinx.coroutines.runBlocking {
                AppDataRepository.get(context).getTypedSettings().autoRecording
            }
        } catch (_: Exception) {
            false
        }
        if (autoRecording && telemetryStore == null) {
            telemetryStore = configuredTelemetryStore()
        }
        recordMarker("connected", config)
    }

    fun finishBoardSession(status: String, markerType: String, config: SessionConfig?) {
        finishRecording(status)
        recordMarker(markerType, config)
        flushTelemetryBlocking()
        telemetryStore = null
        connectionLostMarkerAt = null
    }

    fun failSession(status: String = "error") {
        finishRecording(status)
        flushTelemetryBlocking()
        telemetryStore = null
        connectionLostMarkerAt = null
    }

    fun finishDebugRecording(status: String) {
        finishRecording(status)
    }

    fun recordState(status: String, extra: Map<String, Any?> = emptyMap()) {
        recorder?.recordState(status, extra)
    }

    fun recordChunk(direction: String, bytes: ByteArray) {
        recorder?.recordChunk(direction, bytes)
    }

    fun recordLocation(snapshot: LocationSnapshot) {
        recorder?.recordLocation(snapshot)
    }

    fun recordTelemetry(capture: TelemetryCapture) {
        telemetryStore?.recordTelemetry(capture)
    }

    fun recordError(config: SessionConfig?, message: String) {
        recordState("error", mapOf("message" to message))
        recordMarker("error", config, message)
    }

    fun recordConnectionLost(config: SessionConfig, markerAt: Long, reason: String) {
        val store = telemetryStore ?: return
        if (markerAt <= 0L) return
        if (connectionLostMarkerAt == markerAt) return
        connectionLostMarkerAt = markerAt
        store.recordMarker(
            type = "connection_lost",
            deviceId = config.deviceId,
            deviceName = config.deviceName,
            message = reason,
            occurredAtMs = markerAt,
        )
    }

    fun enableTelemetryRecording(config: SessionConfig) {
        if (telemetryStore == null) {
            telemetryStore = configuredTelemetryStore()
            recordMarker("connected", config)
        }
    }

    fun disableTelemetryRecording(config: SessionConfig?) {
        recordMarker("app_stop", config, "Recording stopped")
        flushTelemetryBlocking()
        telemetryStore = null
        connectionLostMarkerAt = null
    }

    fun applySettings(settings: AppSettings) {
        telemetryStore?.applySettings(settings)
    }

    private fun finishRecording(status: String) {
        recorder?.finish(status = status)
        recorder = null
    }

    private fun flushTelemetryBlocking() {
        telemetryStore?.flushBlocking()
    }

    private fun configuredTelemetryStore(): TelemetryRepository {
        val store = TelemetryRepository.get(context)
        val settings = try {
            kotlinx.coroutines.runBlocking {
                AppDataRepository.get(context).getTypedSettings()
            }
        } catch (_: Exception) {
            null
        }
        val resolvedSettings = settings ?: AppSettings()
        applyLiveSettings(resolvedSettings)
        store.applySettings(resolvedSettings)
        val zones = try {
            kotlinx.coroutines.runBlocking {
                AppDataRepository.get(context).getEnabledPrivacyZoneEntities()
            }
        } catch (_: Exception) {
            emptyList()
        }
        store.reloadPrivacyZones(zones)
        return store
    }

    private fun recordMarker(type: String, config: SessionConfig?, message: String? = null) {
        telemetryStore?.recordMarker(
            type,
            config?.deviceId,
            config?.deviceName,
            message,
        )
    }
}
