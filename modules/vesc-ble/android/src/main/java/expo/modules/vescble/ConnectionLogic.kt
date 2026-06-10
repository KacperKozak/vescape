package expo.modules.vescble

import expo.modules.vescble.reconnect.BOARD_READY_TIMEOUT_BASE_MS
import expo.modules.vescble.reconnect.BOARD_READY_TIMEOUT_MAX_MS
import expo.modules.vescble.reconnect.ReconnectPolicy

internal const val BOARD_READY_TIMEOUT_BASE = BOARD_READY_TIMEOUT_BASE_MS
internal const val BOARD_READY_TIMEOUT_MAX = BOARD_READY_TIMEOUT_MAX_MS
internal const val CAN_PING_TIMEOUT = 3_500L

internal fun boardReadyTimeoutMs(attempt: Int): Long = ReconnectPolicy.boardReadyTimeoutMs(attempt)

internal fun isPollingCapable(canId: Int?, directConnection: Boolean): Boolean =
    canId != null || directConnection

internal fun shouldCanPingFallback(
    canId: Int?,
    directConnection: Boolean,
    boardStatus: BoardPhase,
): Boolean =
    canId == null && !directConnection && boardStatus == BoardPhase.WaitingForTelemetry

internal fun shouldAcceptCanPingResponse(
    boardStatus: BoardPhase,
    directConnection: Boolean,
): Boolean =
    boardStatus != BoardPhase.Connected && !directConnection

internal fun shouldSetDirectOnReady(canId: Int?, directConnection: Boolean): Boolean =
    !isPollingCapable(canId, directConnection)

internal fun shouldStartPollingOnReady(
    canId: Int?,
    directConnection: Boolean,
    pollRunnable: Any?,
): Boolean =
    pollRunnable == null && isPollingCapable(canId, directConnection)
