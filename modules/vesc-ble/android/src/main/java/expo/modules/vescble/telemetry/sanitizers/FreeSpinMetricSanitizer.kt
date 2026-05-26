package expo.modules.vescble.telemetry.sanitizers

import expo.modules.vescble.telemetry.BucketTelemetryPoint
import expo.modules.vescble.telemetry.EXCLUSION_REASON_FREE_SPIN
import expo.modules.vescble.telemetry.FREE_SPIN_GPS_PRECISE_ACCURACY_CM
import expo.modules.vescble.telemetry.FREE_SPIN_LOW_GPS_CUTOFF_CENTI_KMH
import expo.modules.vescble.telemetry.FREE_SPIN_NEAREST_GPS_MAX_AGE_MS
import expo.modules.vescble.telemetry.METRIC_MAX_DUTY
import expo.modules.vescble.telemetry.METRIC_MAX_SPEED
import expo.modules.vescble.telemetry.MetricExclusionEntity
import expo.modules.vescble.telemetry.UNKNOWN_TELEMETRY_DEVICE_ID
import kotlin.math.abs

internal class FreeSpinMetricSanitizer(
  maxSpeedDeltaCentiKmh: Int,
  stationaryBoardCapCentiKmh: Int,
) : MetricSampleSanitizer {
  private val maxDelta = maxSpeedDeltaCentiKmh.coerceAtLeast(0)
  private val stationaryCap = stationaryBoardCapCentiKmh.coerceAtLeast(0)

  override fun sanitize(
    index: Int,
    point: BucketTelemetryPoint,
    context: MetricSanitizationContext,
  ): MetricSanitizerOutput {
    val absSpeed = abs(point.speedCentiKmh)
    val nearestGps = findNearestPreciseGps(index, point, context) ?: return MetricSanitizerOutput()
    val gpsSpeedKmh = gpsSpeedCentiMpsToKmh(nearestGps.gpsSpeedCentiMps!!)
    val freeSpin = if (gpsSpeedKmh < FREE_SPIN_LOW_GPS_CUTOFF_CENTI_KMH) {
      absSpeed > stationaryCap
    } else {
      absSpeed - gpsSpeedKmh > maxDelta
    }
    if (!freeSpin) return MetricSanitizerOutput()

    val deviceId = point.deviceId ?: UNKNOWN_TELEMETRY_DEVICE_ID
    val contextJson = buildFreeSpinContextJson(point, nearestGps)
    val referenceValue = "${gpsSpeedKmh / 100.0}"

    return MetricSanitizerOutput(
      excludedFromMaxSpeed = true,
      excludedFromMaxDuty = true,
      exclusions = listOf(
        MetricExclusionEntity(
          capturedAtMs = point.capturedAtMs,
          deviceId = deviceId,
          metric = METRIC_MAX_SPEED,
          reason = EXCLUSION_REASON_FREE_SPIN,
          rawValue = "${absSpeed / 100.0}",
          referenceValue = referenceValue,
          contextJson = contextJson,
        ),
        MetricExclusionEntity(
          capturedAtMs = point.capturedAtMs,
          deviceId = deviceId,
          metric = METRIC_MAX_DUTY,
          reason = EXCLUSION_REASON_FREE_SPIN,
          rawValue = "${abs(point.dutyPermille) / 1000.0}",
          referenceValue = referenceValue,
          contextJson = contextJson,
        ),
      ),
    )
  }
}

internal fun buildPreciseGpsIndex(samples: List<BucketTelemetryPoint>): List<Int> =
  samples.indices.filter { i -> isPreciseGps(samples[i]) }

internal fun isPreciseGps(point: BucketTelemetryPoint): Boolean =
  point.gpsSpeedCentiMps != null &&
    point.gpsTimestampMs != null &&
    point.gpsAccuracyCm != null &&
    point.gpsAccuracyCm <= FREE_SPIN_GPS_PRECISE_ACCURACY_CM

internal fun findNearestPreciseGps(
  index: Int,
  point: BucketTelemetryPoint,
  context: MetricSanitizationContext,
): BucketTelemetryPoint? {
  if (context.preciseGpsIndices.isEmpty()) return null

  var insertionPoint = context.preciseGpsIndices.binarySearch(index)
  if (insertionPoint < 0) insertionPoint = -(insertionPoint + 1)

  var best: BucketTelemetryPoint? = null
  var bestAge = Long.MAX_VALUE

  for (offset in intArrayOf(0, -1)) {
    val idx = insertionPoint + offset
    if (idx < 0 || idx >= context.preciseGpsIndices.size) continue
    val candidate = context.samples[context.preciseGpsIndices[idx]]
    val age = abs(candidate.gpsTimestampMs!! - point.capturedAtMs)
    if (age <= FREE_SPIN_NEAREST_GPS_MAX_AGE_MS && age < bestAge) {
      best = candidate
      bestAge = age
    }
  }
  for (offset in intArrayOf(1)) {
    val idx = insertionPoint + offset
    if (idx < 0 || idx >= context.preciseGpsIndices.size) continue
    val candidate = context.samples[context.preciseGpsIndices[idx]]
    val age = abs(candidate.gpsTimestampMs!! - point.capturedAtMs)
    if (age <= FREE_SPIN_NEAREST_GPS_MAX_AGE_MS && age < bestAge) {
      best = candidate
      bestAge = age
    }
  }

  return best
}

internal fun gpsSpeedCentiMpsToKmh(centiMps: Int): Int = (centiMps * 36) / 10

private fun buildFreeSpinContextJson(
  point: BucketTelemetryPoint,
  nearestGps: BucketTelemetryPoint,
): String =
  "{" +
    "\"gpsTimestampMs\":${nearestGps.gpsTimestampMs}," +
    "\"sampleTimestampMs\":${point.capturedAtMs}," +
    "\"gpsAccuracyCm\":${nearestGps.gpsAccuracyCm}" +
    "}"
