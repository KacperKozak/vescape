package expo.modules.vescble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Battery-config-mismatch detector behavior: stable-count gating (a single odd frame never fires),
 * one warn payload carrying both counts, matching-count clean evaluation, and the no-data /
 * no-config contracts that leave a stored warning untouched.
 * @parity /modules/vesc-ble/ios/telemetry/BatteryConfigMismatchDetectorTests.swift
 */
class BatteryConfigMismatchDetectorTest {

  @Test
  fun stableMismatchFiresOneWarnWithBothCounts() {
    val detector = BatteryConfigMismatchDetector()
    // First two stable frames are not yet stable enough to compare.
    assertNull(detector.onFrame(18, 15))
    assertNull(detector.onFrame(18, 15))
    val payload = detector.onFrame(18, 15)
    assertEquals("{\"bmsCellCount\":18,\"configuredSeries\":15}", payload)
    // Already reported this mismatch — no repeat on later identical frames.
    assertNull(detector.onFrame(18, 15))
    assertFalse(detector.sessionEndClean())
  }

  @Test
  fun singleOddFrameDoesNotFire() {
    val detector = BatteryConfigMismatchDetector()
    // A one-off wrong count between matching frames never reaches stability, so it never fires.
    assertNull(detector.onFrame(15, 15))
    assertNull(detector.onFrame(18, 15))
    assertNull(detector.onFrame(15, 15))
    assertNull(detector.onFrame(15, 15))
    assertNull(detector.onFrame(15, 15))
    assertTrue(detector.sessionEndClean())
  }

  @Test
  fun stableMatchIsCleanEvaluation() {
    val detector = BatteryConfigMismatchDetector()
    repeat(4) { assertNull(detector.onFrame(15, 15)) }
    assertTrue(detector.sessionEndClean())
  }

  @Test
  fun noBmsDataIsNotClean() {
    val detector = BatteryConfigMismatchDetector()
    assertFalse(detector.sessionEndClean())
  }

  @Test
  fun noConfiguredSeriesIsNotClean() {
    val detector = BatteryConfigMismatchDetector()
    // Stable BMS count but no configured series to compare against — no evaluation at all.
    repeat(4) { assertNull(detector.onFrame(18, null)) }
    assertFalse(detector.sessionEndClean())
  }

  @Test
  fun zeroBmsCountIgnored() {
    val detector = BatteryConfigMismatchDetector()
    repeat(4) { assertNull(detector.onFrame(0, 15)) }
    assertFalse(detector.sessionEndClean())
  }

  @Test
  fun resetClearsState() {
    val detector = BatteryConfigMismatchDetector()
    repeat(3) { detector.onFrame(18, 15) }
    assertFalse(detector.sessionEndClean())
    detector.reset()
    assertFalse(detector.sessionEndClean())
    repeat(3) { assertNull(detector.onFrame(15, 15)) }
    assertTrue(detector.sessionEndClean())
  }
}
