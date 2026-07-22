package expo.modules.vescapecore.telemetry
import expo.modules.vescapecore.runtime.BoardSession
import expo.modules.vescapecore.runtime.Cancellable
import expo.modules.vescapecore.runtime.Scheduler
import expo.modules.vescapecore.runtime.postDelayedForSession

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

    /** Metric keys the mounted `/control` detail charts are focused on (JS intent); empty = none. */
    @Volatile
    private var focusedMetrics: Set<String> = emptySet()

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

    /** Set which metrics the high-res focused stream covers (empty to stop it); emits immediately. */
    fun setFocusedMetrics(metrics: Set<String>) {
        focusedMetrics = metrics
        if (metrics.isNotEmpty()) emitFocusedSeries()
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
            emitFocusedSeries()
            scheduleLiveSeries()
        }
    }

    private fun emitLiveSeries() {
        val metrics = telemetryPipeline.liveSeries(LIVE_SERIES_METRICS, liveSeriesBuckets)
        if (metrics.isNotEmpty()) emitEvent("onLiveSeries", mapOf("metrics" to metrics, "generation" to generation()))
    }

    private fun emitFocusedSeries() {
        val metrics = focusedMetrics
        if (metrics.isEmpty()) return
        for (metric in metrics) {
            val focused = telemetryPipeline.focusedSeries(metric) ?: continue
            emitEvent(
                "onFocusedSeries",
                mapOf(
                    "metric" to metric,
                    "series" to focused.series,
                    "exclusions" to focused.exclusions,
                    "windowMs" to focused.windowMs,
                    "generation" to generation(),
                ),
            )
        }
    }
}
