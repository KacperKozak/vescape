package expo.modules.vescble.connection

import expo.modules.vescble.BoardPhase
import expo.modules.vescble.PendingStart
import expo.modules.vescble.runtime.BoardSession
import expo.modules.vescble.runtime.Cancellable
import expo.modules.vescble.runtime.Scheduler
import expo.modules.vescble.runtime.postDelayedForSession

internal data class ConnectPhaseTimeout(
    val start: PendingStart,
    val phase: String,
    val attempt: Int,
    val elapsedMs: Long,
    val timeoutMs: Long,
    val boardStatus: BoardPhase,
    val canId: Int?,
)

internal class ConnectionCoordinator(
    private val scheduler: Scheduler,
    private val isCurrentSession: (BoardSession) -> Boolean,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    private var connectTimeoutHandle: Cancellable? = null

    var pendingConnect: PendingStart? = null
        private set

    var connectAttempt: Int = 0
        private set

    fun reset() {
        cancelConnectTimeout()
        pendingConnect = null
        connectAttempt = 0
    }

    fun resetAttempts() {
        connectAttempt = 0
    }

    fun clearPending() {
        cancelConnectTimeout()
        pendingConnect = null
    }

    fun markConnectStarting(start: PendingStart): Int {
        pendingConnect = start
        connectAttempt += 1
        cancelConnectTimeout()
        return connectAttempt
    }

    fun resolvePending(): PendingStart? {
        cancelConnectTimeout()
        val start = pendingConnect ?: return null
        pendingConnect = null
        return start
    }

    fun armConnectPhaseTimeout(
        start: PendingStart,
        phase: String,
        timeoutMs: Long,
        status: () -> BoardPhase,
        canId: () -> Int?,
        onTimeout: (ConnectPhaseTimeout) -> Unit,
    ) {
        cancelConnectTimeout()
        val startedAt = nowMs()
        connectTimeoutHandle = scheduler.postDelayed(timeoutMs) {
            if (pendingConnect == start) {
                onTimeout(
                    ConnectPhaseTimeout(
                        start = start,
                        phase = phase,
                        attempt = connectAttempt,
                        elapsedMs = nowMs() - startedAt,
                        timeoutMs = timeoutMs,
                        boardStatus = status(),
                        canId = canId(),
                    ),
                )
            }
        }
    }

    fun cancelConnectTimeout() {
        connectTimeoutHandle?.cancel()
        connectTimeoutHandle = null
    }

    fun retryStatus133Once(
        status: Int,
        wasConnecting: PendingStart,
        session: BoardSession?,
        retryDelayMs: Long,
        restart: (PendingStart) -> Unit,
    ): Boolean {
        if (status != 133 || connectAttempt >= 2) return false
        if (session == null) return true
        scheduler.postDelayedForSession(session, retryDelayMs, isCurrentSession) {
            if (pendingConnect == wasConnecting) restart(wasConnecting)
        }
        return true
    }
}
