package expo.modules.vescble

import expo.modules.vescble.telemetry.AppSettings

internal data class VescLiveStateSnapshot(
    val boardPhase: BoardPhase,
    val boardConfig: SessionConfig?,
    val boardError: String?,
    val connectionSeq: Long,
    val lastTelemetryAt: Long?,
    val recentTelemetry: List<Map<String, Any?>>,
    val gpsActive: Boolean,
    val latestLocation: LocationSnapshot?,
    val latestPreciseLocation: LocationSnapshot?,
    val recentLocations: List<Map<String, Any?>>,
    val gpsError: String?,
    val recordingEnabled: Boolean,
    val remoteTiltValue: Int,
    val remoteTiltPhase: RemoteTiltPhase,
    val remoteTiltDecay: RemoteTiltDecayProgress?,
    val settings: AppSettings,
)

/**
 * Exact native remote-tilt command. Raw values avoid asymmetric percent rounding.
 */
internal fun remoteTiltWire(
    value: Int,
    phase: RemoteTiltPhase,
    decay: RemoteTiltDecayProgress?,
): Map<String, Any?>? {
    if (phase == RemoteTiltPhase.Idle) return null
    return buildMap {
        put("value", value)
        put("phase", phase.wireValue)
        if (decay != null) {
            put("decay", mapOf("elapsedMs" to decay.elapsedMs, "totalMs" to decay.totalMs))
        }
    }
}

internal fun buildLiveState(snapshot: VescLiveStateSnapshot): Map<String, Any?> =
    mapOf(
        "board" to mapOf(
            "phase" to snapshot.boardPhase.wireValue,
            "selectedBoardId" to snapshot.settings.selectedBoardId,
            "connectedBoardId" to snapshot.boardConfig?.appBoardId,
            "bleId" to snapshot.boardConfig?.deviceId,
            "name" to snapshot.boardConfig?.deviceName,
            "connectionSeq" to snapshot.connectionSeq,
            "lastTelemetryAt" to snapshot.lastTelemetryAt,
            "recentTelemetry" to snapshot.recentTelemetry,
            "error" to snapshot.boardError,
            "autoConnect" to snapshot.settings.autoConnect,
            "remoteTilt" to remoteTiltWire(
                snapshot.remoteTiltValue,
                snapshot.remoteTiltPhase,
                snapshot.remoteTiltDecay,
            ),
        ),
        "gps" to mapOf(
            "phase" to if (snapshot.gpsActive) "active" else "idle",
            "latestFix" to snapshot.latestPreciseLocation?.toMap(),
            "latestApproximateFix" to snapshot.latestLocation?.toMap(),
            "latestPreciseFix" to snapshot.latestPreciseLocation?.toMap(),
            "recentLocations" to snapshot.recentLocations,
            "error" to snapshot.gpsError,
        ),
        "scan" to mapOf(
            "phase" to "idle",
            "devices" to emptyList<Map<String, Any?>>(),
            "error" to null,
        ),
        "recording" to mapOf(
            "enabled" to snapshot.recordingEnabled,
            "activeBoardId" to if (snapshot.recordingEnabled) snapshot.boardConfig?.appBoardId else null,
            "startedAt" to null,
        ),
    )
