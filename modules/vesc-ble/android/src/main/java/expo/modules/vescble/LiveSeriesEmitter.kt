package expo.modules.vescble

import expo.modules.vescble.runtime.BoardSession
import expo.modules.vescble.runtime.Cancellable
import expo.modules.vescble.runtime.Scheduler
import expo.modules.vescble.runtime.postDelayedForSession
import expo.modules.vescble.telemetry.LIVE_SERIES_METRICS
import expo.modules.vescble.telemetry.TelemetryPipeline

internal class LiveSeriesEmitter(
    private val scheduler: Scheduler,
    private val emitEvent: (String, Map<String, Any?>) -> Unit,
    private val telemetryPipeline: TelemetryPipeline,
    private val session: () -> BoardSession?,
    private val isCurrentSession: (BoardSession) -> Boolean,
    private val generation: () -> Long,
    private val historyFlushIntervalMs: Long,
    private val liveSeriesIntervalMs: Long,
    private val liveSeriesBuckets: Int,
) {
    private val historyLock = Any()
    private val historySamples = ArrayDeque<Map<String, Any?>>()
    private var historyFlushHandle: Cancellable? = null
    private var liveSeriesHandle: Cancellable? = null
    private var liveSeriesPrimed = false

    fun enqueueHistorySample(sample: Map<String, Any?>) = synchronized(historyLock) {
        historySamples.addLast(sample)
    }

    fun start() {
        if (historyFlushHandle == null) scheduleHistoryFlush()
        if (liveSeriesHandle == null) {
            liveSeriesPrimed = false
            scheduleLiveSeries()
        }
    }

    fun primeLiveSeriesIfNeeded() {
        if (liveSeriesHandle == null || liveSeriesPrimed) return
        liveSeriesPrimed = true
        emitLiveSeries()
    }

    fun stop() {
        historyFlushHandle?.cancel()
        historyFlushHandle = null
        flushHistorySamples()
        synchronized(historyLock) { historySamples.clear() }
        liveSeriesHandle?.cancel()
        liveSeriesHandle = null
        liveSeriesPrimed = false
    }

    private fun scheduleHistoryFlush() {
        val token = session() ?: return
        historyFlushHandle = scheduler.postDelayedForSession(token, historyFlushIntervalMs, isCurrentSession) {
            flushHistorySamples()
            scheduleHistoryFlush()
        }
    }

    private fun flushHistorySamples() {
        val batch = synchronized(historyLock) {
            if (historySamples.isEmpty()) return
            historySamples.toList().also { historySamples.clear() }
        }
        emitEvent("onTelemetryHistory", mapOf("samples" to batch))
    }

    private fun scheduleLiveSeries() {
        val token = session() ?: return
        liveSeriesHandle = scheduler.postDelayedForSession(token, liveSeriesIntervalMs, isCurrentSession) {
            emitLiveSeries()
            scheduleLiveSeries()
        }
    }

    private fun emitLiveSeries() {
        val metrics = telemetryPipeline.liveSeries(LIVE_SERIES_METRICS, liveSeriesBuckets)
        if (metrics.isNotEmpty()) emitEvent("onLiveSeries", mapOf("metrics" to metrics, "generation" to generation()))
    }
}
