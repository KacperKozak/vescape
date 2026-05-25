package expo.modules.vescble.telemetry

import expo.modules.vescble.telemetry.sanitizers.FreeSpinMetricSanitizer
import expo.modules.vescble.telemetry.sanitizers.LowSpeedAverageSpeedSanitizer
import expo.modules.vescble.telemetry.sanitizers.MetricSanitizationContext
import expo.modules.vescble.telemetry.sanitizers.buildPreciseGpsIndex

internal const val DEFAULT_MOVING_SPEED_THRESHOLD_CENTI_KMH = 300
internal const val METRIC_AVG_SPEED = "avg_speed"
internal const val METRIC_MAX_SPEED = "max_speed"
internal const val METRIC_MAX_DUTY = "max_duty"
internal const val EXCLUSION_REASON_LOW_SPEED = "low_speed"
internal const val EXCLUSION_REASON_FREE_SPIN = "free_spin"

internal const val FREE_SPIN_LOW_GPS_CUTOFF_CENTI_KMH = 700
internal const val FREE_SPIN_MAX_DELTA_CENTI_KMH = 1200
internal const val FREE_SPIN_LOW_GPS_BOARD_CAP_CENTI_KMH = 1500
internal const val FREE_SPIN_NEAREST_GPS_MAX_AGE_MS = 10_000L
internal const val FREE_SPIN_GPS_PRECISE_ACCURACY_CM = 2000

internal data class SanitizedSample(
  val index: Int,
  val capturedAtMs: Long,
  val deviceId: String?,
  val excludedFromAvgSpeed: Boolean,
  val excludedFromMaxSpeed: Boolean,
  val excludedFromMaxDuty: Boolean,
)

internal data class SanitizationResult(
  val samples: List<SanitizedSample>,
  val exclusions: List<MetricExclusionEntity>,
)

internal fun sanitizeTelemetrySamples(
  samples: List<BucketTelemetryPoint>,
  movingSpeedThresholdCentiKmh: Int = DEFAULT_MOVING_SPEED_THRESHOLD_CENTI_KMH,
): SanitizationResult {
  val sanitizers = listOf(
    LowSpeedAverageSpeedSanitizer(movingSpeedThresholdCentiKmh),
    FreeSpinMetricSanitizer(),
  )
  val context = MetricSanitizationContext(
    samples = samples,
    preciseGpsIndices = buildPreciseGpsIndex(samples),
  )
  val sanitized = mutableListOf<SanitizedSample>()
  val exclusions = mutableListOf<MetricExclusionEntity>()

  for ((index, point) in samples.withIndex()) {
    val results = sanitizers.map { sanitizer -> sanitizer.sanitize(index, point, context) }

    sanitized.add(
      SanitizedSample(
        index = index,
        capturedAtMs = point.capturedAtMs,
        deviceId = point.deviceId,
        excludedFromAvgSpeed = results.any { it.excludedFromAvgSpeed },
        excludedFromMaxSpeed = results.any { it.excludedFromMaxSpeed },
        excludedFromMaxDuty = results.any { it.excludedFromMaxDuty },
      ),
    )
    exclusions.addAll(results.flatMap { it.exclusions })
  }

  return SanitizationResult(samples = sanitized, exclusions = exclusions)
}
