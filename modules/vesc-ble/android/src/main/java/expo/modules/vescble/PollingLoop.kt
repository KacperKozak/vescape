package expo.modules.vescble

import expo.modules.vescble.runtime.BoardSession
import expo.modules.vescble.runtime.Cancellable
import expo.modules.vescble.runtime.Scheduler
import expo.modules.vescble.runtime.postDelayedForSession
import kotlin.math.max
import kotlin.math.roundToInt

internal class PollingLoop(
    private val scheduler: Scheduler,
    private val isCurrentSession: (BoardSession) -> Boolean,
    private val sendPayloadWithRetry: (ByteArray, BoardSession) -> Boolean,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    private var pollHandle: Cancellable? = null
    private var lastPollAt = 0L
    private val rttHistory = ArrayDeque<Long>()

    val isActive: Boolean
        get() = pollHandle != null

    fun start(
        sessionConfig: SessionConfig,
        session: BoardSession,
        transport: BoardTransport,
    ) {
        val pollPayload = pollPayload(transport)
        stop()

        fun scheduleNext() {
            pollHandle = scheduler.postDelayedForSession(session, sessionConfig.pollIntervalMs, isCurrentSession) {
                lastPollAt = nowMs()
                sendPayloadWithRetry(pollPayload, session)
                scheduleNext()
            }
        }

        pollHandle = scheduler.postDelayedForSession(session, 0L, isCurrentSession) {
            lastPollAt = nowMs()
            sendPayloadWithRetry(pollPayload, session)
            scheduleNext()
        }
    }

    fun stop() {
        pollHandle?.cancel()
        pollHandle = null
    }

    fun updateLatency(now: Long): Int? {
        if (lastPollAt <= 0) return null
        rttHistory.addLast(max(0, now - lastPollAt))
        while (rttHistory.size > 5) rttHistory.removeFirst()
        return rttHistory.average().roundToInt()
    }

    private fun pollPayload(transport: BoardTransport): ByteArray =
        transport.frame(
            byteArrayOf(
                COMM_CUSTOM_APP_DATA.toByte(),
                REFLOAT_MAGIC.toByte(),
                REFLOAT_GET_ALLDATA.toByte(),
                2,
            ),
        )
}
