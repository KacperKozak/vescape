package expo.modules.vescble.telemetry

import expo.modules.vescble.RefloatTelemetry
import expo.modules.vescble.SessionConfig
import expo.modules.vescble.runtime.BoardSession
import expo.modules.vescble.runtime.Cancellable
import expo.modules.vescble.runtime.Scheduler

internal const val DEFAULT_LIVE_HISTORY_LIMIT_MINUTES = 5
internal const val MIN_LIVE_HISTORY_LIMIT_MINUTES = 1
internal const val MAX_LIVE_HISTORY_LIMIT_MINUTES = 50
internal const val DEFAULT_TELEMETRY_STALE_MS = 4_000L

/** One decimated live metric: a key the JS UI knows + how to read it off a telemetry row. */
internal data class LiveSeriesMetric(val key: String, val select: (Map<String, Any?>) -> Double?)

private fun Map<String, Any?>.num(key: String): Double? = (this[key] as? Number)?.toDouble()

private fun Map<String, Any?>.excluded(key: String): Boolean =
    (this["metricExclusions"] as? Map<*, *>)?.get(key) == true

/**
 * Every live metric the JS UI renders from the decimated series: the center-screen
 * sparklines (strip + dual gauge + battery) plus, temporarily, the `/control` detail
 * charts (which used to stream raw full samples — see the perf note on `useLiveMetric`).
 * Kept in sync with `liveSelectors` on the JS side, keyed by the same names: any
 * abs/scale/exclusion is applied here *before* min/max bucketing so native decimation
 * matches what JS would compute, and the UI renders the values verbatim.
 */
internal val LIVE_SERIES_METRICS = listOf(
    LiveSeriesMetric("motorTemp") { row -> row.num("tempMotor")?.takeIf { it > 0 } },
    LiveSeriesMetric("controllerTemp") { row -> row.num("tempMosfet") },
    LiveSeriesMetric("motorCurrent") { row -> row.num("motorCurrent") },
    LiveSeriesMetric("batteryCurrent") { row -> row.num("batteryCurrent") },
    LiveSeriesMetric("batteryVoltage") { row -> row.num("batteryVoltage") },
    LiveSeriesMetric("batteryPercent") { row -> row.num("batteryPercent") },
    LiveSeriesMetric("speed") { row ->
        if (row.excluded("max_speed")) null else row.num("speed")?.let { kotlin.math.abs(it) }
    },
    LiveSeriesMetric("duty") { row ->
        if (row.excluded("max_duty")) null else row.num("dutyCycle")?.let { kotlin.math.abs(it) * 100 }
    },
    // Detail-chart-only metrics (no center sparkline). Here so `/control` screens can
    // read the cheap decimated series instead of the full-sample firehose.
    LiveSeriesMetric("pitch") { row -> row.num("pitch") },
    LiveSeriesMetric("roll") { row -> row.num("roll") },
    LiveSeriesMetric("balancePitch") { row -> row.num("balancePitch") },
    LiveSeriesMetric("footpadAdc1") { row -> row.num("adc1") },
    LiveSeriesMetric("footpadAdc2") { row -> row.num("adc2") },
)

internal data class ProcessedTelemetry(
    val eventMap: MutableMap<String, Any?>,
    val capture: TelemetryCapture,
    val metricExclusionUpdates: List<Map<String, Any?>>,
)

internal class TelemetryPipeline(
    private val scheduler: Scheduler,
    private val onTelemetryStale: () -> Unit,
    private val captureBuilder: (RefloatTelemetry, SessionConfig, Int?) -> TelemetryCapture,
    private val nowMs: () -> Long = System::currentTimeMillis,
    private val staleTimeoutMs: Long = DEFAULT_TELEMETRY_STALE_MS,
) {
    private data class LivePoint(
        val bucketPoint: BucketTelemetryPoint,
        val eventMap: MutableMap<String, Any?>,
    )

    private val recentTelemetry = ArrayDeque<MutableMap<String, Any?>>()
    private val liveTelemetryPoints = ArrayDeque<LivePoint>()
    // recentTelemetry is appended on the BLE callback thread and read (snapshot/decimated)
    // on the main thread, so every structural access goes through this lock.
    private val recentLock = Any()
    private var session: BoardSession? = null
    private var sessionConfig: SessionConfig? = null
    private var canId: Int? = null
    private var liveHistoryLimitMinutes = DEFAULT_LIVE_HISTORY_LIMIT_MINUTES
    private var staleHandle: Cancellable? = null

    var lastTelemetryAt: Long = 0L
        private set
    var metricSanitizerConfig: MetricSanitizerConfig = MetricSanitizerConfig()

    fun beginSession(session: BoardSession, config: SessionConfig) {
        cancelStaleWatchdog()
        synchronized(recentLock) { recentTelemetry.clear() }
        liveTelemetryPoints.clear()
        lastTelemetryAt = 0L
        this.session = session
        this.sessionConfig = config
        // The active CAN id is seeded by the service from the stored Board
        // Transport via updateCanId; a fresh session starts untagged.
        this.canId = null
    }

    fun endSession() {
        cancelStaleWatchdog()
        synchronized(recentLock) { recentTelemetry.clear() }
        liveTelemetryPoints.clear()
        lastTelemetryAt = 0L
        session = null
        sessionConfig = null
        canId = null
    }

    fun updateCanId(canId: Int?) {
        this.canId = canId
    }

    fun resetLastTelemetryAt() {
        lastTelemetryAt = 0L
    }

    fun setLiveHistoryLimitMinutes(minutes: Int) {
        liveHistoryLimitMinutes = minutes.coerceIn(
            MIN_LIVE_HISTORY_LIMIT_MINUTES,
            MAX_LIVE_HISTORY_LIMIT_MINUTES,
        )
        val now = nowMs()
        synchronized(recentLock) { pruneRecentTelemetry(now) }
        pruneLiveTelemetryPoints(now)
    }

    fun liveHistoryLimitMinutes(): Int = liveHistoryLimitMinutes

    fun recentWindowMs(): Long = liveHistoryLimitMinutes.toLong() * 60_000L

    fun recentSnapshot(): List<Map<String, Any?>> = synchronized(recentLock) { recentTelemetry.toList() }

    /**
     * Render-ready min/max series per metric, decimated from the in-memory live
     * window. Lets the UI draw sparklines without streaming every raw sample.
     */
    fun liveSeries(metrics: List<LiveSeriesMetric>, bucketCount: Int): Map<String, DoubleArray> {
        // Copy the deque under lock, then decimate the snapshot without holding it.
        val rows = synchronized(recentLock) { if (recentTelemetry.isEmpty()) null else recentTelemetry.toList() }
            ?: return emptyMap()
        val windowMs = recentWindowMs()
        val result = HashMap<String, DoubleArray>(metrics.size)
        for (metric in metrics) {
            result[metric.key] = LiveSeriesDownsampler.downsampleMinMax(
                rows,
                bucketCount,
                windowMs,
                { (it["lastPacketAt"] as Number).toLong() },
                metric.select,
            )
        }
        return result
    }

    fun armStaleWatchdog() {
        val armedAt = lastTelemetryAt
        staleHandle?.cancel()
        staleHandle = scheduler.postDelayed(staleTimeoutMs) {
            staleHandle = null
            val stillStale = lastTelemetryAt == armedAt ||
                nowMs() - lastTelemetryAt >= staleTimeoutMs
            if (stillStale) onTelemetryStale()
        }
    }

    fun cancelStaleWatchdog() {
        staleHandle?.cancel()
        staleHandle = null
    }

    fun process(parsed: RefloatTelemetry, sessionToken: BoardSession): ProcessedTelemetry? {
        val cfg = sessionConfig ?: return null
        val currentSession = session ?: return null
        if (sessionToken !== currentSession || !sessionToken.isActive) return null

        lastTelemetryAt = parsed.lastPacketAt
        armStaleWatchdog()

        val capture = captureBuilder(parsed, cfg, canId)
        val baseEventMap = parsed.toMap().toMutableMap()
        val bucketPoint = FullTelemetryState.from(capture).toBucketPoint()
        liveTelemetryPoints.addLast(LivePoint(bucketPoint, baseEventMap))
        pruneLiveTelemetryPoints(parsed.lastPacketAt)
        val updates = sanitizeLivePoints()
        synchronized(recentLock) {
            recentTelemetry.addLast(baseEventMap)
            pruneRecentTelemetry(parsed.lastPacketAt)
        }

        return ProcessedTelemetry(baseEventMap, capture, updates)
    }

    private fun pruneLiveTelemetryPoints(now: Long) {
        val oldest = now - recentWindowMs()
        while (liveTelemetryPoints.isNotEmpty() &&
            liveTelemetryPoints.first().bucketPoint.capturedAtMs < oldest
        ) {
            liveTelemetryPoints.removeFirst()
        }
    }

    private fun pruneRecentTelemetry(now: Long) {
        val oldest = now - recentWindowMs()
        while (recentTelemetry.isNotEmpty()) {
            val ts = (recentTelemetry.first()["lastPacketAt"] as? Number)?.toLong() ?: break
            if (ts >= oldest) break
            recentTelemetry.removeFirst()
        }
    }

    private fun sanitizeLivePoints(): List<Map<String, Any?>> {
        if (liveTelemetryPoints.isEmpty()) return emptyList()
        val points = liveTelemetryPoints.map { it.bucketPoint }
        val sanitization = sanitizeTelemetrySamples(points, metricSanitizerConfig)
        val updates = mutableListOf<Map<String, Any?>>()
        val lastIndex = liveTelemetryPoints.size - 1
        liveTelemetryPoints.forEachIndexed { index, point ->
            val exclusions = sanitization.samples[index].toLiveMetricExclusions()
            val previous = point.eventMap["metricExclusions"] as? Map<*, *>
            point.eventMap["metricExclusions"] = exclusions
            if (index != lastIndex && previous != exclusions) updates.add(
                mapOf(
                    "lastPacketAt" to point.bucketPoint.capturedAtMs,
                    "metricExclusions" to exclusions,
                ),
            )
        }
        return updates
    }

    private fun SanitizedSample.toLiveMetricExclusions(): Map<String, Boolean> =
        buildMap {
            if (excludedFromAvgSpeed) put(METRIC_AVG_SPEED, true)
            if (excludedFromMaxSpeed) put(METRIC_MAX_SPEED, true)
            if (excludedFromMaxDuty) put(METRIC_MAX_DUTY, true)
        }
}
