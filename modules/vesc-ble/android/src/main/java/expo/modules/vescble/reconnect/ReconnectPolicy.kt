package expo.modules.vescble.reconnect

internal const val RECONNECT_BACKOFF_STEP_MS = 250L
internal const val RECONNECT_BACKOFF_MAX_MS = 2_000L
internal const val RECONNECT_SCAN_TIMEOUT_MS = 6_000L
internal const val RECONNECT_MAX_ATTEMPTS = 60
internal const val BOARD_READY_TIMEOUT_BASE_MS = 4_000L
internal const val BOARD_READY_TIMEOUT_MAX_MS = 15_000L
internal const val BOARD_READY_TIMEOUT_STEP_MS = 2_000L

internal sealed interface ReconnectDecision {
    data class Retry(val attempt: Int, val delayMs: Long) : ReconnectDecision
    data object GiveUp : ReconnectDecision
}

internal object ReconnectPolicy {
    @Suppress("UNUSED_PARAMETER")
    fun nextDecision(
        currentAttempt: Int,
        lastError: String? = null,
        maxAttempts: Int = RECONNECT_MAX_ATTEMPTS,
    ): ReconnectDecision {
        val next = currentAttempt + 1
        if (next > maxAttempts) return ReconnectDecision.GiveUp
        val delay = (RECONNECT_BACKOFF_STEP_MS * next).coerceAtMost(RECONNECT_BACKOFF_MAX_MS)
        return ReconnectDecision.Retry(attempt = next, delayMs = delay)
    }

    fun scanTimeoutMs(): Long = RECONNECT_SCAN_TIMEOUT_MS

    fun boardReadyTimeoutMs(attempt: Int): Long {
        val ms = BOARD_READY_TIMEOUT_BASE_MS + (attempt * BOARD_READY_TIMEOUT_STEP_MS)
        return ms.coerceAtMost(BOARD_READY_TIMEOUT_MAX_MS)
    }
}
