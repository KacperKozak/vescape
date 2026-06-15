package expo.modules.vescble

import expo.modules.vescble.reconnect.BOARD_READY_TIMEOUT_BASE_MS
import expo.modules.vescble.reconnect.BOARD_READY_TIMEOUT_MAX_MS
import expo.modules.vescble.reconnect.ReconnectPolicy

internal const val BOARD_READY_TIMEOUT_BASE = BOARD_READY_TIMEOUT_BASE_MS
internal const val BOARD_READY_TIMEOUT_MAX = BOARD_READY_TIMEOUT_MAX_MS
internal const val DETECT_CAN_PING_TIMEOUT_MS = 3_500L

/** Per-candidate window a detection probe waits for one valid Telemetry Sample. */
internal const val DETECT_PROBE_TIMEOUT_MS = 2_500L

internal fun boardReadyTimeoutMs(attempt: Int): Long = ReconnectPolicy.boardReadyTimeoutMs(attempt)

internal fun isPollingCapable(canId: Int?, directConnection: Boolean): Boolean =
    canId != null || directConnection

internal fun shouldStartPollingOnReady(
    canId: Int?,
    directConnection: Boolean,
    pollRunnable: Any?,
): Boolean =
    pollRunnable == null && isPollingCapable(canId, directConnection)
