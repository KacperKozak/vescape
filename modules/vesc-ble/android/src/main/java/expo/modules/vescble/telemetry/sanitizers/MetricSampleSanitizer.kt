package expo.modules.vescble.telemetry.sanitizers

import expo.modules.vescble.telemetry.BucketTelemetryPoint
import expo.modules.vescble.telemetry.MetricExclusionEntity

internal data class MetricSanitizationContext(
  val samples: List<BucketTelemetryPoint>,
  val preciseGpsIndices: List<Int>,
)

internal data class MetricSanitizerOutput(
  val excludedFromAvgSpeed: Boolean = false,
  val excludedFromMaxSpeed: Boolean = false,
  val excludedFromMaxDuty: Boolean = false,
  val exclusions: List<MetricExclusionEntity> = emptyList(),
)

internal interface MetricSampleSanitizer {
  fun sanitize(
    index: Int,
    point: BucketTelemetryPoint,
    context: MetricSanitizationContext,
  ): MetricSanitizerOutput
}
