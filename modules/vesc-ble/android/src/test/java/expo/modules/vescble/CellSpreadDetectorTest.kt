package expo.modules.vescble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Cell-spread detector behavior: sustain gating (transient spikes never fire), warn/critical tiers on
 * the peak spread, charging/balancing payload context, peak tracking through re-reports, worst-group
 * selection, and the session-end clean-evaluation contract.
 * @parity /modules/vesc-ble/ios/telemetry/CellSpreadDetectorTests.swift
 */
class CellSpreadDetectorTest {
  private val noBalance = listOf(false, false)

  @Test
  fun singleFrameSpikeDoesNotFire() {
    val detector = CellSpreadDetector()
    // One frame well over threshold, then it drops — a transient spike must never fire.
    assertNull(detector.onFrame(listOf(3.80, 3.98), noBalance, 0.0, 0L))
    assertNull(detector.onFrame(listOf(3.90, 3.91), noBalance, 0.0, 100L))
    assertNull(detector.onFrame(listOf(3.80, 3.98), noBalance, 0.0, 5_000L))
  }

  @Test
  fun sustainedSpreadFiresWarnWithPayload() {
    val detector = CellSpreadDetector()
    // Spread 0.12 V: over warn (0.10), under critical (0.25).
    assertNull(detector.onFrame(listOf(3.80, 3.92), noBalance, 0.0, 0L))
    val finding = detector.onFrame(listOf(3.80, 3.92), noBalance, 0.0, 3_000L)
    assertNotNull(finding)
    assertEquals(CellSpreadSeverity.WARN, finding!!.severity)
    assertEquals(
      "{\"peakSpread\":0.1200,\"worstGroup\":0,\"charging\":false,\"balancing\":false}",
      finding.payloadJson,
    )
  }

  @Test
  fun sustainedSpreadOverCriticalFiresCritical() {
    val detector = CellSpreadDetector()
    // Spread 0.28 V: over critical (0.25).
    assertNull(detector.onFrame(listOf(3.70, 3.98), noBalance, 0.0, 0L))
    val finding = detector.onFrame(listOf(3.70, 3.98), noBalance, 0.0, 3_000L)
    assertNotNull(finding)
    assertEquals(CellSpreadSeverity.CRITICAL, finding!!.severity)
  }

  @Test
  fun payloadRecordsChargingAndBalancingContext() {
    val detector = CellSpreadDetector()
    val balancing = listOf(false, true)
    assertNull(detector.onFrame(listOf(3.80, 3.92), balancing, 55.0, 0L))
    val finding = detector.onFrame(listOf(3.80, 3.92), balancing, 55.0, 3_000L)
    assertNotNull(finding)
    assertEquals(
      "{\"peakSpread\":0.1200,\"worstGroup\":0,\"charging\":true,\"balancing\":true}",
      finding!!.payloadJson,
    )
  }

  @Test
  fun chargeDetectionMirrorsThreshold() {
    val detector = CellSpreadDetector()
    // vCharge just under the 10 V floor is not charging.
    assertNull(detector.onFrame(listOf(3.80, 3.92), noBalance, 9.5, 0L))
    val finding = detector.onFrame(listOf(3.80, 3.92), noBalance, 9.5, 3_000L)
    assertTrue(finding!!.payloadJson.contains("\"charging\":false"))
  }

  @Test
  fun risingPeakReReportsAboveEpsilonOnly() {
    val detector = CellSpreadDetector()
    assertNull(detector.onFrame(listOf(3.80, 3.92), noBalance, 0.0, 0L))
    val first = detector.onFrame(listOf(3.80, 3.92), noBalance, 0.0, 3_000L)
    assertNotNull(first)
    assertTrue(first!!.payloadJson.contains("\"peakSpread\":0.1200"))

    // Peak climbs to 0.20 V (still warn): re-report with the new peak.
    val second = detector.onFrame(listOf(3.80, 4.00), noBalance, 0.0, 3_100L)
    assertNotNull(second)
    assertTrue(second!!.payloadJson.contains("\"peakSpread\":0.2000"))

    // A 2 mV further climb is below the report epsilon (5 mV): nothing new.
    assertNull(detector.onFrame(listOf(3.80, 4.002), noBalance, 0.0, 3_200L))
  }

  @Test
  fun escalatesWarnToCritical() {
    val detector = CellSpreadDetector()
    assertNull(detector.onFrame(listOf(3.80, 3.92), noBalance, 0.0, 0L))
    val warn = detector.onFrame(listOf(3.80, 3.92), noBalance, 0.0, 3_000L)
    assertEquals(CellSpreadSeverity.WARN, warn!!.severity)

    val critical = detector.onFrame(listOf(3.70, 3.98), noBalance, 0.0, 3_100L)
    assertNotNull(critical)
    assertEquals(CellSpreadSeverity.CRITICAL, critical!!.severity)
  }

  @Test
  fun worstGroupIsFurthestFromAverage() {
    val detector = CellSpreadDetector()
    // Cells 3.70 / 3.85 / 3.98: group 0 is furthest below the 3.843 average.
    val cells = listOf(3.70, 3.85, 3.98)
    val balancing = listOf(false, false, false)
    assertNull(detector.onFrame(cells, balancing, 0.0, 0L))
    val finding = detector.onFrame(cells, balancing, 0.0, 3_000L)
    assertNotNull(finding)
    assertTrue(finding!!.payloadJson.contains("\"worstGroup\":0"))
  }

  @Test
  fun invalidCellsAreFilteredAndCountAsNoData() {
    val detector = CellSpreadDetector()
    // No finite positive cells: not usable data, never fires, not clean at session end.
    assertNull(detector.onFrame(listOf(0.0, Double.NaN), listOf(false, false), 0.0, 0L))
    assertFalse(detector.sessionEndClean())
  }

  @Test
  fun sessionEndCleanOnlyWhenDataFlowedAndNeverFired() {
    val quietData = CellSpreadDetector()
    quietData.onFrame(listOf(3.90, 3.91), noBalance, 0.0, 0L)
    assertTrue(quietData.sessionEndClean())

    val noData = CellSpreadDetector()
    assertFalse(noData.sessionEndClean())

    val transientOnly = CellSpreadDetector()
    // Over-threshold spikes that never sustain do not block the clean clear.
    transientOnly.onFrame(listOf(3.80, 3.98), noBalance, 0.0, 0L)
    transientOnly.onFrame(listOf(3.90, 3.91), noBalance, 0.0, 100L)
    assertTrue(transientOnly.sessionEndClean())

    val fired = CellSpreadDetector()
    fired.onFrame(listOf(3.80, 3.92), noBalance, 0.0, 0L)
    fired.onFrame(listOf(3.80, 3.92), noBalance, 0.0, 3_000L)
    assertFalse(fired.sessionEndClean())
  }

  @Test
  fun resetRestoresCleanState() {
    val detector = CellSpreadDetector()
    detector.onFrame(listOf(3.80, 3.92), noBalance, 0.0, 0L)
    detector.onFrame(listOf(3.80, 3.92), noBalance, 0.0, 3_000L)
    assertFalse(detector.sessionEndClean())

    detector.reset()
    assertFalse(detector.sessionEndClean())
    // After reset the sustain window starts fresh: a lone over-threshold frame does not fire.
    assertNull(detector.onFrame(listOf(3.80, 3.92), noBalance, 0.0, 10_000L))
  }
}
