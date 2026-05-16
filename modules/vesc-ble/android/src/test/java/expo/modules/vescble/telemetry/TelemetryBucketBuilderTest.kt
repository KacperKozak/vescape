package expo.modules.vescble.telemetry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TelemetryBucketBuilderTest {
  @Test
  fun combinesBoardAndGpsPointsForSameDeviceMinute() {
    val buckets = buildTelemetryBuckets(
      telemetryPoints = listOf(
        BucketTelemetryPoint(
          capturedAtMs = 125_000L,
          deviceId = "board-1",
          deviceName = "ADV2",
          speedCentiKmh = -1_200,
          batteryVoltageMv = 77_500,
          motorCurrentMa = -2_500,
          batteryCurrentMa = 1_200,
          dutyPermille = -300,
          hasFault = false,
          odometerCm = 10_000L,
        ),
        BucketTelemetryPoint(
          capturedAtMs = 130_000L,
          deviceId = "board-1",
          deviceName = "ADV2",
          speedCentiKmh = 1_600,
          batteryVoltageMv = 77_100,
          motorCurrentMa = 3_500,
          batteryCurrentMa = -1_400,
          dutyPermille = 350,
          hasFault = true,
          odometerCm = 10_420L,
        ),
      ),
      locationPoints = listOf(
        BucketLocationPoint(
          capturedAtMs = 131_000L,
          deviceId = "board-1",
          deviceName = "ADV2",
          precise = true,
          distanceFromPreviousCm = 230L,
          gpsSpeedCentiMps = 1_250,
        ),
        BucketLocationPoint(
          capturedAtMs = 132_000L,
          deviceId = "board-1",
          deviceName = "ADV2",
          precise = false,
          distanceFromPreviousCm = null,
          gpsSpeedCentiMps = 900,
        ),
      ),
    ).single()

    assertEquals(120_000L, buckets.bucketStartMs)
    assertEquals("board-1", buckets.deviceId)
    assertEquals("ADV2", buckets.deviceName)
    assertEquals(2, buckets.sampleCount)
    assertEquals(2, buckets.gpsPointCount)
    assertEquals(1, buckets.preciseGpsPointCount)
    assertEquals(1, buckets.faultCount)
    assertEquals(2_800L, buckets.sumAbsSpeedCentiKmh)
    assertEquals(1_600, buckets.maxAbsSpeedCentiKmh)
    assertEquals(77_100, buckets.minBatteryVoltageMv)
    assertEquals(3_500, buckets.maxMotorCurrentAbsMa)
    assertEquals(1_400, buckets.maxBatteryCurrentAbsMa)
    assertEquals(129L, buckets.batteryUsedWhMilli)
    assertEquals(0L, buckets.batteryRegenWhMilli)
    assertEquals(350, buckets.maxDutyAbsPermille)
    assertEquals(10_000L, buckets.firstOdometerCm)
    assertEquals(10_420L, buckets.lastOdometerCm)
    assertEquals(230L, buckets.gpsDistanceCm)
    assertEquals(1_250, buckets.maxGpsSpeedCentiMps)
  }

  @Test
  fun createsGpsOnlyBucketForUnknownDevice() {
    val bucket = buildTelemetryBuckets(
      telemetryPoints = emptyList(),
      locationPoints = listOf(
        BucketLocationPoint(
          capturedAtMs = 65_000L,
          deviceId = null,
          deviceName = null,
          precise = true,
          distanceFromPreviousCm = null,
          gpsSpeedCentiMps = null,
        ),
      ),
    ).single()

    assertEquals(60_000L, bucket.bucketStartMs)
    assertEquals(UNKNOWN_TELEMETRY_DEVICE_ID, bucket.deviceId)
    assertNull(bucket.deviceName)
    assertEquals(0, bucket.sampleCount)
    assertEquals(1, bucket.gpsPointCount)
    assertEquals(1, bucket.preciseGpsPointCount)
    assertEquals(0L, bucket.gpsDistanceCm)
    assertNull(bucket.maxGpsSpeedCentiMps)
  }

  @Test
  fun splitsDifferentDevicesAndMinutes() {
    val buckets = buildTelemetryBuckets(
      telemetryPoints = listOf(
        BucketTelemetryPoint(
          capturedAtMs = 10_000L,
          deviceId = "a",
          deviceName = "A",
          speedCentiKmh = 100,
          batteryVoltageMv = 70_000,
          motorCurrentMa = 0,
          batteryCurrentMa = 0,
          dutyPermille = 0,
          hasFault = false,
          odometerCm = null,
        ),
        BucketTelemetryPoint(
          capturedAtMs = 70_000L,
          deviceId = "a",
          deviceName = "A",
          speedCentiKmh = 200,
          batteryVoltageMv = 70_000,
          motorCurrentMa = 0,
          batteryCurrentMa = 0,
          dutyPermille = 0,
          hasFault = false,
          odometerCm = null,
        ),
        BucketTelemetryPoint(
          capturedAtMs = 10_000L,
          deviceId = "b",
          deviceName = "B",
          speedCentiKmh = 300,
          batteryVoltageMv = 70_000,
          motorCurrentMa = 0,
          batteryCurrentMa = 0,
          dutyPermille = 0,
          hasFault = false,
          odometerCm = null,
        ),
      ),
      locationPoints = emptyList(),
    )

    assertEquals(setOf(0L to "a", 60_000L to "a", 0L to "b"), buckets.map {
      it.bucketStartMs to it.deviceId
    }.toSet())
  }

  @Test
  fun integratesBatteryUsedAndRegenInsideMinuteBucket() {
    val bucket = buildTelemetryBuckets(
      telemetryPoints = listOf(
        BucketTelemetryPoint(
          capturedAtMs = 0L,
          deviceId = "board-1",
          deviceName = "ADV2",
          speedCentiKmh = 0,
          batteryVoltageMv = 50_000,
          motorCurrentMa = 0,
          batteryCurrentMa = 10_000,
          dutyPermille = 0,
          hasFault = false,
          odometerCm = 0L,
        ),
        BucketTelemetryPoint(
          capturedAtMs = 3_600L,
          deviceId = "board-1",
          deviceName = "ADV2",
          speedCentiKmh = 0,
          batteryVoltageMv = 50_000,
          motorCurrentMa = 0,
          batteryCurrentMa = -5_000,
          dutyPermille = 0,
          hasFault = false,
          odometerCm = 10L,
        ),
        BucketTelemetryPoint(
          capturedAtMs = 7_200L,
          deviceId = "board-1",
          deviceName = "ADV2",
          speedCentiKmh = 0,
          batteryVoltageMv = 50_000,
          motorCurrentMa = 0,
          batteryCurrentMa = 0,
          dutyPermille = 0,
          hasFault = false,
          odometerCm = 20L,
        ),
      ),
      locationPoints = emptyList(),
    ).single()

    assertEquals(500L, bucket.batteryUsedWhMilli)
    assertEquals(250L, bucket.batteryRegenWhMilli)
  }
}
