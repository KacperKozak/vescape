package expo.modules.vescble.telemetry.sanitizers

import expo.modules.vescble.telemetry.BucketTelemetryPoint
import expo.modules.vescble.telemetry.EXCLUSION_REASON_LOW_SPEED
import expo.modules.vescble.telemetry.METRIC_AVG_SPEED
import expo.modules.vescble.telemetry.MetricExclusionEntity
import expo.modules.vescble.telemetry.UNKNOWN_TELEMETRY_DEVICE_ID
import kotlin.math.abs

internal class LowSpeedAverageSpeedSanitizer(
  movingSpeedThresholdCentiKmh: Int,
) : MetricSampleSanitizer {
  private val threshold = movingSpeedThresholdCentiKmh.coerceAtLeast(0)

  override fun sanitize(
    index: Int,
    point: BucketTelemetryPoint,
    context: MetricSanitizationContext,
  ): MetricSanitizerOutput {
    val absSpeed = abs(point.speedCentiKmh)
    if (absSpeed >= threshold) return MetricSanitizerOutput()

    return MetricSanitizerOutput(
      excludedFromAvgSpeed = true,
      exclusions = listOf(
        MetricExclusionEntity(
          capturedAtMs = point.capturedAtMs,
          deviceId = point.deviceId ?: UNKNOWN_TELEMETRY_DEVICE_ID,
          metric = METRIC_AVG_SPEED,
          reason = EXCLUSION_REASON_LOW_SPEED,
          rawValue = "${absSpeed / 100.0}",
          referenceValue = null,
          contextJson = null,
        ),
      ),
    )
  }
}
