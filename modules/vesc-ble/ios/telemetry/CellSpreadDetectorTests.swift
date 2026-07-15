import XCTest
@testable import VescBle

/// Cell-spread detector behavior: sustain gating (transient spikes never fire), warn/critical tiers on
/// the peak spread, charging/balancing payload context, peak tracking through re-reports, worst-group
/// selection, and the session-end clean-evaluation contract.
/// @parity /modules/vesc-ble/android/src/test/java/expo/modules/vescble/CellSpreadDetectorTest.kt
final class CellSpreadDetectorTests: XCTestCase {
  private let noBalance = [false, false]

  func testSingleFrameSpikeDoesNotFire() {
    let detector = CellSpreadDetector()
    // One frame well over threshold, then it drops — a transient spike must never fire.
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, 3.98], balancing: noBalance, vCharge: 0.0, atMs: 0))
    XCTAssertNil(detector.onFrame(cellVoltages: [3.90, 3.91], balancing: noBalance, vCharge: 0.0, atMs: 100))
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, 3.98], balancing: noBalance, vCharge: 0.0, atMs: 5_000))
  }

  func testSustainedSpreadFiresWarnWithPayload() {
    let detector = CellSpreadDetector()
    // Spread 0.12 V: over warn (0.10), under critical (0.25).
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 0))
    let finding = detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 3_000)
    XCTAssertNotNil(finding)
    XCTAssertEqual(finding?.severity, .warn)
    XCTAssertEqual(
      finding?.payloadJson,
      "{\"peakSpread\":0.1200,\"worstGroup\":0,\"charging\":false,\"balancing\":false}"
    )
  }

  func testSustainedSpreadOverCriticalFiresCritical() {
    let detector = CellSpreadDetector()
    // Spread 0.28 V: over critical (0.25).
    XCTAssertNil(detector.onFrame(cellVoltages: [3.70, 3.98], balancing: noBalance, vCharge: 0.0, atMs: 0))
    let finding = detector.onFrame(cellVoltages: [3.70, 3.98], balancing: noBalance, vCharge: 0.0, atMs: 3_000)
    XCTAssertNotNil(finding)
    XCTAssertEqual(finding?.severity, .critical)
  }

  func testPayloadRecordsChargingAndBalancingContext() {
    let detector = CellSpreadDetector()
    let balancing = [false, true]
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, 3.92], balancing: balancing, vCharge: 55.0, atMs: 0))
    let finding = detector.onFrame(cellVoltages: [3.80, 3.92], balancing: balancing, vCharge: 55.0, atMs: 3_000)
    XCTAssertNotNil(finding)
    XCTAssertEqual(
      finding?.payloadJson,
      "{\"peakSpread\":0.1200,\"worstGroup\":0,\"charging\":true,\"balancing\":true}"
    )
  }

  func testChargeDetectionMirrorsThreshold() {
    let detector = CellSpreadDetector()
    // vCharge just under the 10 V floor is not charging.
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 9.5, atMs: 0))
    let finding = detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 9.5, atMs: 3_000)
    XCTAssertTrue(finding?.payloadJson.contains("\"charging\":false") ?? false)
  }

  func testRisingPeakReReportsAboveEpsilonOnly() {
    let detector = CellSpreadDetector()
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 0))
    let first = detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 3_000)
    XCTAssertTrue(first?.payloadJson.contains("\"peakSpread\":0.1200") ?? false)

    // Peak climbs to 0.20 V (still warn): re-report with the new peak.
    let second = detector.onFrame(cellVoltages: [3.80, 4.00], balancing: noBalance, vCharge: 0.0, atMs: 3_100)
    XCTAssertTrue(second?.payloadJson.contains("\"peakSpread\":0.2000") ?? false)

    // A 2 mV further climb is below the report epsilon (5 mV): nothing new.
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, 4.002], balancing: noBalance, vCharge: 0.0, atMs: 3_200))
  }

  func testEscalatesWarnToCritical() {
    let detector = CellSpreadDetector()
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 0))
    let warn = detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 3_000)
    XCTAssertEqual(warn?.severity, .warn)

    let critical = detector.onFrame(cellVoltages: [3.70, 3.98], balancing: noBalance, vCharge: 0.0, atMs: 3_100)
    XCTAssertNotNil(critical)
    XCTAssertEqual(critical?.severity, .critical)
  }

  func testWorstGroupIsFurthestFromAverage() {
    let detector = CellSpreadDetector()
    // Cells 3.70 / 3.85 / 3.98: group 0 is furthest below the 3.843 average.
    let cells = [3.70, 3.85, 3.98]
    let balancing = [false, false, false]
    XCTAssertNil(detector.onFrame(cellVoltages: cells, balancing: balancing, vCharge: 0.0, atMs: 0))
    let finding = detector.onFrame(cellVoltages: cells, balancing: balancing, vCharge: 0.0, atMs: 3_000)
    XCTAssertTrue(finding?.payloadJson.contains("\"worstGroup\":0") ?? false)
  }

  func testInvalidCellsAreFilteredAndCountAsNoData() {
    let detector = CellSpreadDetector()
    // No finite positive cells: not usable data, never fires, not clean at session end.
    XCTAssertNil(detector.onFrame(cellVoltages: [0.0, Double.nan], balancing: noBalance, vCharge: 0.0, atMs: 0))
    XCTAssertFalse(detector.sessionEndClean())
  }

  func testSingleValidCellIsNotUsableData() {
    let detector = CellSpreadDetector()
    // Only one valid group: spread is undefined, so the frame is not usable data and never fires.
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, 0.0], balancing: noBalance, vCharge: 0.0, atMs: 0))
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, -1.0], balancing: noBalance, vCharge: 0.0, atMs: 3_000))
    XCTAssertFalse(detector.sessionEndClean())
  }

  func testLongGapBreaksSustainContinuity() {
    let detector = CellSpreadDetector()
    // Over threshold, then a gap longer than the continuity tolerance (reconnect / interruption):
    // the unobserved time must not count toward the sustain window.
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 0))
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 5_000))
    // Sustain restarts at the post-gap frame, so it fires only 3 s after that.
    let finding = detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 8_000)
    XCTAssertNotNil(finding)
    XCTAssertEqual(finding?.severity, .warn)
  }

  func testLaterWeakerEpisodeDoesNotDowngrade() {
    let detector = CellSpreadDetector()
    // Critical episode fires and then falls back under threshold.
    XCTAssertNil(detector.onFrame(cellVoltages: [3.70, 3.98], balancing: noBalance, vCharge: 0.0, atMs: 0))
    let critical = detector.onFrame(cellVoltages: [3.70, 3.98], balancing: noBalance, vCharge: 0.0, atMs: 3_000)
    XCTAssertEqual(critical?.severity, .critical)
    XCTAssertNil(detector.onFrame(cellVoltages: [3.90, 3.91], balancing: noBalance, vCharge: 0.0, atMs: 3_100))

    // A later sustained warn episode must not overwrite the stored critical with weaker data.
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 4_000))
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 7_000))
  }

  func testInFlightEpisodeAtSessionEndBlocksClean() {
    let detector = CellSpreadDetector()
    // Session ends while spread is over threshold but before it sustained: not a clean session.
    _ = detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 0)
    XCTAssertFalse(detector.sessionEndClean())
  }

  func testSessionEndCleanOnlyWhenDataFlowedAndNeverFired() {
    let quietData = CellSpreadDetector()
    _ = quietData.onFrame(cellVoltages: [3.90, 3.91], balancing: noBalance, vCharge: 0.0, atMs: 0)
    XCTAssertTrue(quietData.sessionEndClean())

    let noData = CellSpreadDetector()
    XCTAssertFalse(noData.sessionEndClean())

    let transientOnly = CellSpreadDetector()
    // Over-threshold spikes that never sustain do not block the clean clear.
    _ = transientOnly.onFrame(cellVoltages: [3.80, 3.98], balancing: noBalance, vCharge: 0.0, atMs: 0)
    _ = transientOnly.onFrame(cellVoltages: [3.90, 3.91], balancing: noBalance, vCharge: 0.0, atMs: 100)
    XCTAssertTrue(transientOnly.sessionEndClean())

    let fired = CellSpreadDetector()
    _ = fired.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 0)
    _ = fired.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 3_000)
    XCTAssertFalse(fired.sessionEndClean())
  }

  func testResetRestoresCleanState() {
    let detector = CellSpreadDetector()
    _ = detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 0)
    _ = detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 3_000)
    XCTAssertFalse(detector.sessionEndClean())

    detector.reset()
    XCTAssertFalse(detector.sessionEndClean())
    // After reset the sustain window starts fresh: a lone over-threshold frame does not fire.
    XCTAssertNil(detector.onFrame(cellVoltages: [3.80, 3.92], balancing: noBalance, vCharge: 0.0, atMs: 10_000))
  }
}
