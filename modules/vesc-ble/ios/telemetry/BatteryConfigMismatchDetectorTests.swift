import XCTest
@testable import VescBle

/// Battery-config-mismatch detector behavior: stable-count gating (a single odd frame never fires),
/// one warn payload carrying both counts, matching-count clean evaluation, and the no-data /
/// no-config contracts that leave a stored warning untouched.
/// @parity /modules/vesc-ble/android/src/test/java/expo/modules/vescble/BatteryConfigMismatchDetectorTest.kt
final class BatteryConfigMismatchDetectorTests: XCTestCase {

  func testStableMismatchFiresOneWarnWithBothCounts() {
    let detector = BatteryConfigMismatchDetector()
    // First two stable frames are not yet stable enough to compare.
    XCTAssertNil(detector.onFrame(bmsCellCount: 18, configuredSeries: 15))
    XCTAssertNil(detector.onFrame(bmsCellCount: 18, configuredSeries: 15))
    XCTAssertEqual(
      detector.onFrame(bmsCellCount: 18, configuredSeries: 15),
      "{\"bmsCellCount\":18,\"configuredSeries\":15}"
    )
    // Already reported this mismatch — no repeat on later identical frames.
    XCTAssertNil(detector.onFrame(bmsCellCount: 18, configuredSeries: 15))
    XCTAssertFalse(detector.sessionEndClean())
  }

  func testLiveConfigChangeReReportsWithNewSeries() {
    let detector = BatteryConfigMismatchDetector()
    // Stable 18 vs 15S fires once.
    for _ in 0..<2 { XCTAssertNil(detector.onFrame(bmsCellCount: 18, configuredSeries: 15)) }
    XCTAssertEqual(
      detector.onFrame(bmsCellCount: 18, configuredSeries: 15),
      "{\"bmsCellCount\":18,\"configuredSeries\":15}"
    )
    // Config changes to 16S mid-session, BMS count unchanged — a different mismatch must re-report
    // so the stored payload does not keep the stale series count.
    XCTAssertEqual(
      detector.onFrame(bmsCellCount: 18, configuredSeries: 16),
      "{\"bmsCellCount\":18,\"configuredSeries\":16}"
    )
    // Same pair again is deduped.
    XCTAssertNil(detector.onFrame(bmsCellCount: 18, configuredSeries: 16))
  }

  func testSingleOddFrameDoesNotFire() {
    let detector = BatteryConfigMismatchDetector()
    // A one-off wrong count between matching frames never reaches stability, so it never fires.
    XCTAssertNil(detector.onFrame(bmsCellCount: 15, configuredSeries: 15))
    XCTAssertNil(detector.onFrame(bmsCellCount: 18, configuredSeries: 15))
    XCTAssertNil(detector.onFrame(bmsCellCount: 15, configuredSeries: 15))
    XCTAssertNil(detector.onFrame(bmsCellCount: 15, configuredSeries: 15))
    XCTAssertNil(detector.onFrame(bmsCellCount: 15, configuredSeries: 15))
    XCTAssertTrue(detector.sessionEndClean())
  }

  func testStableMatchIsCleanEvaluation() {
    let detector = BatteryConfigMismatchDetector()
    for _ in 0..<4 { XCTAssertNil(detector.onFrame(bmsCellCount: 15, configuredSeries: 15)) }
    XCTAssertTrue(detector.sessionEndClean())
  }

  func testNoBmsDataIsNotClean() {
    let detector = BatteryConfigMismatchDetector()
    XCTAssertFalse(detector.sessionEndClean())
  }

  func testNoConfiguredSeriesIsNotClean() {
    let detector = BatteryConfigMismatchDetector()
    // Stable BMS count but no configured series to compare against — no evaluation at all.
    for _ in 0..<4 { XCTAssertNil(detector.onFrame(bmsCellCount: 18, configuredSeries: nil)) }
    XCTAssertFalse(detector.sessionEndClean())
  }

  func testZeroBmsCountIgnored() {
    let detector = BatteryConfigMismatchDetector()
    for _ in 0..<4 { XCTAssertNil(detector.onFrame(bmsCellCount: 0, configuredSeries: 15)) }
    XCTAssertFalse(detector.sessionEndClean())
  }

  func testResetClearsState() {
    let detector = BatteryConfigMismatchDetector()
    for _ in 0..<3 { _ = detector.onFrame(bmsCellCount: 18, configuredSeries: 15) }
    XCTAssertFalse(detector.sessionEndClean())
    detector.reset()
    XCTAssertFalse(detector.sessionEndClean())
    for _ in 0..<3 { XCTAssertNil(detector.onFrame(bmsCellCount: 15, configuredSeries: 15)) }
    XCTAssertTrue(detector.sessionEndClean())
  }
}
