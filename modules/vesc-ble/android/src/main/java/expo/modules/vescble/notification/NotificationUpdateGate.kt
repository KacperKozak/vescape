package expo.modules.vescble.notification

import expo.modules.vescble.BoardPhase

internal class NotificationUpdateGate(
    private val minIntervalMs: Long,
) {
    private var lastPostAtMs: Long = Long.MIN_VALUE
    private var lastPhase: BoardPhase? = null

    fun shouldPost(phase: BoardPhase, nowMs: Long, force: Boolean = false): Boolean {
        if (force || phase != lastPhase || nowMs - lastPostAtMs >= minIntervalMs) {
            lastPhase = phase
            lastPostAtMs = nowMs
            return true
        }
        return false
    }
}
