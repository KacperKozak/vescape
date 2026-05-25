package expo.modules.vescble.telemetry

import kotlin.math.abs

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
  val threshold = movingSpeedThresholdCentiKmh.coerceAtLeast(0)
  val sanitized = mutableListOf<SanitizedSample>()
  val exclusions = mutableListOf<MetricExclusionEntity>()
  val preciseGpsIndices = buildPreciseGpsIndex(samples)

  for ((index, point) in samples.withIndex()) {
    val absSpeed = abs(point.speedCentiKmh)
    val excludedFromAvgSpeed = absSpeed < threshold
    val freeSpin = detectFreeSpin(index, point, samples, preciseGpsIndices)

    sanitized.add(
      SanitizedSample(
        index = index,
        capturedAtMs = point.capturedAtMs,
        deviceId = point.deviceId,
        excludedFromAvgSpeed = excludedFromAvgSpeed,
        excludedFromMaxSpeed = freeSpin,
        excludedFromMaxDuty = freeSpin,
      ),
    )

    val deviceId = point.deviceId ?: UNKNOWN_TELEMETRY_DEVICE_ID
    if (excludedFromAvgSpeed) {
      exclusions.add(
        MetricExclusionEntity(
          capturedAtMs = point.capturedAtMs,
          deviceId = deviceId,
          metric = METRIC_AVG_SPEED,
          reason = EXCLUSION_REASON_LOW_SPEED,
          rawValue = "${absSpeed / 100.0}",
          referenceValue = null,
          contextJson = null,
        ),
      )
    }
    if (freeSpin) {
      val nearestGps = findNearestPreciseGps(index, point, samples, preciseGpsIndices)
      val gpsSpeedKmh = nearestGps?.let { gpsSpeedCentiMpsToKmh(it.gpsSpeedCentiMps!!) }
      val contextParts = buildList {
        nearestGps?.let { gps ->
          add("\"gpsTimestampMs\":${gps.gpsTimestampMs}")
          add("\"sampleTimestampMs\":${point.capturedAtMs}")
          add("\"gpsAccuracyCm\":${gps.gpsAccuracyCm}")
        }
      }
      val contextJson = if (contextParts.isNotEmpty()) "{${contextParts.joinToString(",")}}" else null
      exclusions.add(
        MetricExclusionEntity(
          capturedAtMs = point.capturedAtMs,
          deviceId = deviceId,
          metric = METRIC_MAX_SPEED,
          reason = EXCLUSION_REASON_FREE_SPIN,
          rawValue = "${absSpeed / 100.0}",
          referenceValue = gpsSpeedKmh?.let { "${it / 100.0}" },
          contextJson = contextJson,
        ),
      )
      exclusions.add(
        MetricExclusionEntity(
          capturedAtMs = point.capturedAtMs,
          deviceId = deviceId,
          metric = METRIC_MAX_DUTY,
          reason = EXCLUSION_REASON_FREE_SPIN,
          rawValue = "${abs(point.dutyPermille) / 1000.0}",
          referenceValue = gpsSpeedKmh?.let { "${it / 100.0}" },
          contextJson = contextJson,
        ),
      )
    }
  }

  return SanitizationResult(samples = sanitized, exclusions = exclusions)
}

private fun buildPreciseGpsIndex(samples: List<BucketTelemetryPoint>): List<Int> =
  samples.indices.filter { i -> isPreciseGps(samples[i]) }

private fun isPreciseGps(point: BucketTelemetryPoint): Boolean =
  point.gpsSpeedCentiMps != null &&
    point.gpsTimestampMs != null &&
    point.gpsAccuracyCm != null &&
    point.gpsAccuracyCm <= FREE_SPIN_GPS_PRECISE_ACCURACY_CM

private fun detectFreeSpin(
  index: Int,
  point: BucketTelemetryPoint,
  samples: List<BucketTelemetryPoint>,
  preciseGpsIndices: List<Int>,
): Boolean {
  val absSpeedCentiKmh = abs(point.speedCentiKmh)
  val nearestGps = findNearestPreciseGps(index, point, samples, preciseGpsIndices) ?: return false
  val gpsSpeedCentiKmh = gpsSpeedCentiMpsToKmh(nearestGps.gpsSpeedCentiMps!!)

  return if (gpsSpeedCentiKmh < FREE_SPIN_LOW_GPS_CUTOFF_CENTI_KMH) {
    absSpeedCentiKmh > FREE_SPIN_LOW_GPS_BOARD_CAP_CENTI_KMH
  } else {
    absSpeedCentiKmh - gpsSpeedCentiKmh > FREE_SPIN_MAX_DELTA_CENTI_KMH
  }
}

private fun findNearestPreciseGps(
  index: Int,
  point: BucketTelemetryPoint,
  samples: List<BucketTelemetryPoint>,
  preciseGpsIndices: List<Int>,
): BucketTelemetryPoint? {
  if (preciseGpsIndices.isEmpty()) return null

  var insertionPoint = preciseGpsIndices.binarySearch(index)
  if (insertionPoint < 0) insertionPoint = -(insertionPoint + 1)

  var best: BucketTelemetryPoint? = null
  var bestAge = Long.MAX_VALUE

  for (offset in intArrayOf(0, -1)) {
    val idx = insertionPoint + offset
    if (idx < 0 || idx >= preciseGpsIndices.size) continue
    val candidate = samples[preciseGpsIndices[idx]]
    val age = abs(candidate.gpsTimestampMs!! - point.capturedAtMs)
    if (age <= FREE_SPIN_NEAREST_GPS_MAX_AGE_MS && age < bestAge) {
      best = candidate
      bestAge = age
    }
  }
  for (offset in intArrayOf(1)) {
    val idx = insertionPoint + offset
    if (idx < 0 || idx >= preciseGpsIndices.size) continue
    val candidate = samples[preciseGpsIndices[idx]]
    val age = abs(candidate.gpsTimestampMs!! - point.capturedAtMs)
    if (age <= FREE_SPIN_NEAREST_GPS_MAX_AGE_MS && age < bestAge) {
      best = candidate
      bestAge = age
    }
  }

  return best
}

private fun gpsSpeedCentiMpsToKmh(centiMps: Int): Int = (centiMps * 36) / 10
