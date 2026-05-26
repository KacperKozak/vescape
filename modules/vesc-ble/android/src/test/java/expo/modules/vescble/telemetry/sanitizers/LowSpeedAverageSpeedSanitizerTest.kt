package expo.modules.vescble.telemetry.sanitizers

import expo.modules.vescble.telemetry.BucketTelemetryPoint
import expo.modules.vescble.telemetry.EXCLUSION_REASON_LOW_SPEED
import expo.modules.vescble.telemetry.METRIC_AVG_SPEED
import expo.modules.vescble.telemetry.UNKNOWN_TELEMETRY_DEVICE_ID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LowSpeedAverageSpeedSanitizerTest {
  @Test
  fun excludesSampleBelowThreshold() {
    val point = point(capturedAtMs = 1000L, speedCentiKmh = 299)

    val result = LowSpeedAverageSpeedSanitizer(300).sanitize(
      index = 0,
      point = point,
      context = contextFor(point),
    )

    assertTrue(result.excludedFromAvgSpeed)
    assertFalse(result.excludedFromMaxSpeed)
    assertFalse(result.excludedFromMaxDuty)
    assertEquals(1, result.exclusions.size)
    assertEquals(METRIC_AVG_SPEED, result.exclusions.single().metric)
    assertEquals(EXCLUSION_REASON_LOW_SPEED, result.exclusions.single().reason)
    assertEquals("2.99", result.exclusions.single().rawValue)
  }

  @Test
  fun keepsSampleAtThreshold() {
    val point = point(speedCentiKmh = 300)

    val result = LowSpeedAverageSpeedSanitizer(300).sanitize(
      index = 0,
      point = point,
      context = contextFor(point),
    )

    assertFalse(result.excludedFromAvgSpeed)
    assertTrue(result.exclusions.isEmpty())
  }

  @Test
  fun usesAbsoluteSpeedAndUnknownDeviceFallback() {
    val point = point(deviceId = null, speedCentiKmh = -200)

    val result = LowSpeedAverageSpeedSanitizer(300).sanitize(
      index = 0,
      point = point,
      context = contextFor(point),
    )

    assertTrue(result.excludedFromAvgSpeed)
    assertEquals(UNKNOWN_TELEMETRY_DEVICE_ID, result.exclusions.single().deviceId)
    assertEquals("2.0", result.exclusions.single().rawValue)
  }

  private fun contextFor(vararg points: BucketTelemetryPoint) = MetricSanitizationContext(
    samples = points.toList(),
    preciseGpsIndices = emptyList(),
  )

  private fun point(
    capturedAtMs: Long = 0L,
    deviceId: String? = "board-1",
    speedCentiKmh: Int = 0,
  ) = BucketTelemetryPoint(
    capturedAtMs = capturedAtMs,
    deviceId = deviceId,
    deviceName = "Test",
    speedCentiKmh = speedCentiKmh,
    batteryVoltageMv = 70_000,
    motorCurrentMa = 0,
    batteryCurrentMa = 0,
    dutyPermille = 0,
    hasFault = false,
    odometerCm = null,
  )
}
