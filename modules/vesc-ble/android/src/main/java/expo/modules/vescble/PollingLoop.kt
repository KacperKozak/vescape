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
    private var pollCount = 0
    val isActive: Boolean
        get() = pollHandle != null

    fun start(
        sessionConfig: SessionConfig,
        session: BoardSession,
        canId: Int?,
        directConnection: Boolean,
    ) {
        if (!isPollingCapable(canId, directConnection)) return
        stop()
        val mode2EveryN = mode2EveryN(sessionConfig.pollIntervalMs)

        fun sendPoll() {
            lastPollAt = nowMs()
            sendPayloadWithRetry(pollPayload(canId, directConnection, nextMode(mode2EveryN)) ?: return, session)
        }

        fun scheduleNext() {
            pollHandle = scheduler.postDelayedForSession(session, sessionConfig.pollIntervalMs, isCurrentSession) {
                sendPoll()
                scheduleNext()
            }
        }

        pollHandle = scheduler.postDelayedForSession(session, 0L, isCurrentSession) {
            sendPoll()
            scheduleNext()
        }
    }

    fun stop() {
        pollHandle?.cancel()
        pollHandle = null
        pollCount = 0
    }

    fun updateLatency(now: Long): Int? {
        if (lastPollAt <= 0) return null
        return max(0, now - lastPollAt).toInt()
    }

    private fun nextMode(mode2EveryN: Int): Byte {
        pollCount += 1
        return if (pollCount % mode2EveryN == 0) 2 else 1
    }

    private fun mode2EveryN(pollIntervalMs: Long): Int =
        max(1, (1000L / max(1L, pollIntervalMs)).toInt())

    private fun pollPayload(canId: Int?, directConnection: Boolean, mode: Byte): ByteArray? =
        when {
            canId != null -> byteArrayOf(
                COMM_FORWARD_CAN.toByte(),
                canId.toByte(),
                COMM_CUSTOM_APP_DATA.toByte(),
                REFLOAT_MAGIC.toByte(),
                REFLOAT_GET_ALLDATA.toByte(),
                mode,
            )
            directConnection -> byteArrayOf(
                COMM_CUSTOM_APP_DATA.toByte(),
                REFLOAT_MAGIC.toByte(),
                REFLOAT_GET_ALLDATA.toByte(),
                mode,
            )
            else -> null
        }
}
