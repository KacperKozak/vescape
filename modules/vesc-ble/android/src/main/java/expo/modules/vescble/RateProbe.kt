package expo.modules.vescble

import android.os.Handler
import android.os.Looper

data class RateTestStep(
    val intervalMs: Long,
    val pollsSent: Int,
    val responsesReceived: Int,
    val successRate: Double,
    val avgLatencyMs: Double?,
)

data class RateTestResult(
    val steps: List<RateTestStep>,
    val recommendedIntervalMs: Long,
    val maxStableRate: Int,
)

internal class RateProbe(
    private val sendPayload: (ByteArray) -> Boolean,
    private val buildPollPayload: () -> ByteArray,
    private val onTelemetry: ((RefloatTelemetry) -> Unit)? = null,
) {
    private val handler = Handler(Looper.getMainLooper())
    private var active = false
    private var onProgress: ((RateTestStep) -> Unit)? = null
    private var onAdaptiveComplete: ((stableIntervalMs: Long) -> Unit)? = null
    private var onEnduranceStats: ((enduranceSent: Int, enduranceRecv: Int) -> Unit)? = null

    private var pollsSent = 0
    private var responsesReceived = 0
    private var pollLatencies = mutableListOf<Long>()
    private var lastPollAt = 0L
    private var stepTimer: Runnable? = null
    private var stepEndTimer: Runnable? = null
    private var currentIntervalMs = 0L
    private var acceptingResponses = false

    // Endurance mode
    private var endurance = false
    private var enduranceSent = 0
    private var enduranceRecv = 0
    private var enduranceStatsTimer: Runnable? = null

    private val stepDurationMs = 4000L
    private val drainMs = 600L
    private val enduranceStatsIntervalMs = 2000L

    // Adaptive state
    private var fastestStable = 0L
    private var lastUnstable = 0L
    private var adaptiveDone = false

    val isActive: Boolean get() = active
    val isEndurance: Boolean get() = endurance

    fun start(
        onProgress: (RateTestStep) -> Unit,
        onAdaptiveComplete: (stableIntervalMs: Long) -> Unit,
        onEnduranceStats: (enduranceSent: Int, enduranceRecv: Int) -> Unit,
    ) {
        if (active) return
        active = true
        endurance = false
        this.onProgress = onProgress
        this.onAdaptiveComplete = onAdaptiveComplete
        this.onEnduranceStats = onEnduranceStats
        fastestStable = 0L
        lastUnstable = Long.MAX_VALUE
        adaptiveDone = false
        handler.post { runStep(5L) }
    }

    fun stop() {
        active = false
        endurance = false
        acceptingResponses = false
        cancelStep()
        cancelStepEnd()
        cancelEnduranceStats()
        onProgress = null
        onAdaptiveComplete = null
        onEnduranceStats = null
    }

    fun onResponse(telemetry: RefloatTelemetry) {
        if (!active || !acceptingResponses) return
        onTelemetry?.invoke(telemetry)
        val now = System.currentTimeMillis()
        if (endurance) {
            enduranceRecv++
        } else {
            responsesReceived++
            if (lastPollAt > 0) pollLatencies.add(now - lastPollAt)
        }
    }

    private fun runStep(intervalMs: Long) {
        if (!active) return
        currentIntervalMs = intervalMs
        pollsSent = 0
        responsesReceived = 0
        pollLatencies.clear()
        acceptingResponses = true

        cancelStepEnd()
        stepEndTimer = Runnable {
            if (active) completeStep()
        }
        handler.postDelayed(stepEndTimer!!, stepDurationMs)

        schedulePolls()
    }

    private fun schedulePolls() {
        if (!active) return
        sendPayload(buildPollPayload())
        lastPollAt = System.currentTimeMillis()
        if (endurance) {
            enduranceSent++
        } else {
            pollsSent++
        }
        stepTimer = Runnable { schedulePolls() }
        handler.postDelayed(stepTimer!!, currentIntervalMs)
    }

    private fun completeStep() {
        cancelStep()
        cancelStepEnd()
        acceptingResponses = false

        if (adaptiveDone) {
            // Enter endurance mode at the fastest stable interval
            beginEndurance(fastestStable)
            return
        }

        val successRate = if (pollsSent == 0) 0.0 else responsesReceived.toDouble() / pollsSent.toDouble()
        val avgLatency = if (pollLatencies.isNotEmpty()) pollLatencies.average() else null
        val step = RateTestStep(
            intervalMs = currentIntervalMs,
            pollsSent = pollsSent,
            responsesReceived = responsesReceived,
            successRate = successRate,
            avgLatencyMs = avgLatency,
        )
        onProgress?.invoke(step)

        val stable = successRate >= 0.99

        if (stable) {
            fastestStable = currentIntervalMs
            val next = maxOf(currentIntervalMs / 2, 1L)
            if (next < currentIntervalMs) {
                scheduleNextAdaptive(next)
            } else {
                adaptiveDone = true
                scheduleNextAdaptive(currentIntervalMs)
            }
        } else {
            lastUnstable = minOf(lastUnstable, currentIntervalMs)
            if (fastestStable > 0 && lastUnstable - fastestStable <= 2) {
                adaptiveDone = true
                scheduleNextAdaptive(fastestStable)
            } else {
                val next = (fastestStable + lastUnstable) / 2
                if (next > fastestStable && next < lastUnstable) {
                    scheduleNextAdaptive(next)
                } else {
                    adaptiveDone = true
                    scheduleNextAdaptive(fastestStable)
                }
            }
        }
    }

    private fun scheduleNextAdaptive(nextMs: Long) {
        handler.postDelayed({
            if (adaptiveDone) {
                onAdaptiveComplete?.invoke(fastestStable)
                beginEndurance(fastestStable)
            } else {
                runStep(nextMs)
            }
        }, drainMs)
    }

    private fun beginEndurance(intervalMs: Long) {
        if (!active) return
        endurance = true
        enduranceSent = 0
        enduranceRecv = 0
        currentIntervalMs = intervalMs
        acceptingResponses = true

        // Fire periodic endurance stats
        enduranceStatsTimer = Runnable {
            if (active && endurance) {
                onEnduranceStats?.invoke(enduranceSent, enduranceRecv)
                enduranceSent = 0
                enduranceRecv = 0
                handler.postDelayed(enduranceStatsTimer!!, enduranceStatsIntervalMs)
            }
        }
        handler.postDelayed(enduranceStatsTimer!!, enduranceStatsIntervalMs)

        // Start polling at the endurance rate
        schedulePolls()
    }

    private fun cancelEnduranceStats() {
        enduranceStatsTimer?.let { handler.removeCallbacks(it) }
        enduranceStatsTimer = null
    }

    private fun cancelStep() {
        stepTimer?.let { handler.removeCallbacks(it) }
        stepTimer = null
    }

    private fun cancelStepEnd() {
        stepEndTimer?.let { handler.removeCallbacks(it) }
        stepEndTimer = null
    }

    companion object {
        fun computeResult(steps: List<RateTestStep>): RateTestResult {
            val stableSteps = steps.filter { it.successRate >= 0.99 }
            val recommended = if (stableSteps.isNotEmpty()) {
                stableSteps.minByOrNull { it.intervalMs }?.intervalMs ?: 500L
            } else {
                val okSteps = steps.filter { it.successRate >= 0.90 }
                okSteps.minByOrNull { it.intervalMs }?.intervalMs ?: 500L
            }
            val maxStableRate = if (recommended > 0) (1000.0 / recommended).toInt() else 0
            return RateTestResult(
                steps = steps.sortedBy { it.intervalMs },
                recommendedIntervalMs = recommended,
                maxStableRate = maxStableRate,
            )
        }
    }
}
