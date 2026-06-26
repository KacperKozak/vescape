package expo.modules.vescble

import android.content.Context
import expo.modules.vescble.telemetry.AppDataRepository

internal const val DEFAULT_BOARD_NAME = "VESC Board"

/**
 * Builds a [SessionConfig] from a stored board record. Shared by JS-driven connect
 * ([VescBleModule.selectBoard]) and notification-driven connect ([BoardSessionController]).
 *
 * Poll rate cap (Hz) → minimum spacing floor between requests. 0 Hz = unlimited (pure
 * response-paced: send the next poll as soon as the reply lands). Polling stays response-paced
 * either way, so the floor caps the rate without outrunning the controller. Changing the cap
 * mid-session is applied live via reloadTelemetrySettings (see updateSetting).
 */
internal suspend fun buildSessionConfig(
    context: Context,
    boardId: String,
    recordingEnabled: Boolean,
): SessionConfig {
    val repo = AppDataRepository.get(context.applicationContext)
    val board = repo.getBoard(boardId)
        ?: throw IllegalArgumentException("Board not found: $boardId")
    @Suppress("UNCHECKED_CAST")
    val link = board["link"] as? Map<String, Any?>
    val bleId = link?.get("bleId") as? String
    if (bleId.isNullOrBlank()) {
        throw IllegalArgumentException("Board has no Board Link: $boardId")
    }
    val boardName = board["name"] as? String ?: DEFAULT_BOARD_NAME
    return SessionConfig(
        appBoardId = boardId,
        deviceId = bleId,
        deviceName = boardName,
        transport = BoardTransport.fromBridge(link["transport"]),
        hasBms = link["hasBms"] as? Boolean,
        pollIntervalMs = pollIntervalMsForHz(repo.getTypedSettings().telemetryPollRateHz),
        recordingEnabled = recordingEnabled,
        telemetryRecordingEnabled = false,
        autoReconnect = true,
    )
}
