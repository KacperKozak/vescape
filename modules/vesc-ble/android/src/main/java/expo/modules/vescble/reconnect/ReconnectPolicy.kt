package expo.modules.vescble.reconnect

internal const val RECONNECT_BACKOFF_STEP_MS = 500L
internal const val RECONNECT_BACKOFF_MAX_MS = 5_000L
internal const val RECONNECT_SCAN_TIMEOUT_MS = 6_000L
internal const val BOARD_READY_TIMEOUT_BASE_MS = 4_000L
internal const val BOARD_READY_TIMEOUT_MAX_MS = 15_000L
internal const val BOARD_READY_TIMEOUT_STEP_MS = 2_000L

/** The next reconnect attempt index and the backoff delay to wait before it fires. */
internal data class ReconnectRetry(val attempt: Int, val delayMs: Long)

internal object ReconnectPolicy {
    /**
     * Reconnect retries are unbounded, matching iOS (CoreBluetooth persistent connect): a board
     * that is simply powered off must keep being retried until it returns, never giving up. Backoff
     * still grows linearly then caps so the radio isn't hammered while the board is away.
     */
    fun nextRetry(currentAttempt: Int): ReconnectRetry {
        val next = currentAttempt + 1
        val delay = (RECONNECT_BACKOFF_STEP_MS * next).coerceAtMost(RECONNECT_BACKOFF_MAX_MS)
        return ReconnectRetry(attempt = next, delayMs = delay)
    }

    fun scanTimeoutMs(): Long = RECONNECT_SCAN_TIMEOUT_MS

    fun boardReadyTimeoutMs(attempt: Int): Long {
        val ms = BOARD_READY_TIMEOUT_BASE_MS + (attempt * BOARD_READY_TIMEOUT_STEP_MS)
        return ms.coerceAtMost(BOARD_READY_TIMEOUT_MAX_MS)
    }
}
