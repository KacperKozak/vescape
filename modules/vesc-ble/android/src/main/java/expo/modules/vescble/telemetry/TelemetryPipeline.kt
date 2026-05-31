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

internal data class ProcessedTelemetry(
    val eventMap: MutableMap<String, Any?>,
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
        recentTelemetry.clear()
        liveTelemetryPoints.clear()
        lastTelemetryAt = 0L
        this.session = session
        this.sessionConfig = config
        this.canId = config.canId
    }

    fun endSession() {
        cancelStaleWatchdog()
        recentTelemetry.clear()
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
        pruneRecentTelemetry(now)
        pruneLiveTelemetryPoints(now)
    }

    fun liveHistoryLimitMinutes(): Int = liveHistoryLimitMinutes

    fun recentWindowMs(): Long = liveHistoryLimitMinutes.toLong() * 60_000L

    fun recentSnapshot(): List<Map<String, Any?>> = recentTelemetry.toList()

    fun armStaleWatchdog() {
        val cfg = sessionConfig ?: return
        if (!cfg.autoReconnect) return
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
        recentTelemetry.addLast(baseEventMap)
        pruneRecentTelemetry(parsed.lastPacketAt)

        return ProcessedTelemetry(baseEventMap, updates)
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
