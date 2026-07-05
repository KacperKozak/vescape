import XCTest
@testable import VescBle

/// @parity /modules/vesc-ble/android/src/test/java/expo/modules/vescble/telemetry/SocMedianWindowTest.kt
final class SocMedianWindowTests: XCTestCase {

  func testSingleSampleReturnsItself() {
    let w = SocMedianWindow(windowMs: 20_000)
    XCTAssertEqual(w.median(percent: 54.0, nowMs: 0), 54.0, accuracy: 0.001)
  }

  func testQuantizesToTenthPercentBuckets() {
    let w = SocMedianWindow(windowMs: 20_000)
    XCTAssertEqual(w.median(percent: 54.06, nowMs: 0), 54.1, accuracy: 0.001)
  }

  func testOddCountReturnsMiddleValue() {
    let w = SocMedianWindow(windowMs: 20_000)
    _ = w.median(percent: 50.0, nowMs: 0)
    _ = w.median(percent: 90.0, nowMs: 1_000)
    // sorted [50, 55, 90] -> 55
    XCTAssertEqual(w.median(percent: 55.0, nowMs: 2_000), 55.0, accuracy: 0.001)
  }

  func testEvenCountAveragesTheTwoMiddleValues() {
    let w = SocMedianWindow(windowMs: 20_000)
    _ = w.median(percent: 50.0, nowMs: 0)
    _ = w.median(percent: 52.0, nowMs: 1_000)
    _ = w.median(percent: 58.0, nowMs: 2_000)
    // sorted [50, 52, 58, 90] -> (52 + 58) / 2 = 55
    XCTAssertEqual(w.median(percent: 90.0, nowMs: 3_000), 55.0, accuracy: 0.001)
  }

  func testSingleSampleSpikeIsRejectedByTheMedian() {
    let w = SocMedianWindow(windowMs: 20_000)
    _ = w.median(percent: 54.0, nowMs: 0)
    _ = w.median(percent: 53.0, nowMs: 1_000)
    // sorted [48, 53, 54] -> median 53; the lone 5% sag dip is ignored
    XCTAssertEqual(w.median(percent: 48.0, nowMs: 2_000), 53.0, accuracy: 0.001)
  }

  func testDropsSamplesOlderThanTheWindow() {
    let w = SocMedianWindow(windowMs: 5_000)
    _ = w.median(percent: 0.0, nowMs: 0) // expires before 7_000
    _ = w.median(percent: 100.0, nowMs: 6_000)
    // window holds [100, 50] -> median 75
    XCTAssertEqual(w.median(percent: 50.0, nowMs: 7_000), 75.0, accuracy: 0.001)
  }

  func testZeroWindowDisablesSmoothing() {
    let w = SocMedianWindow(windowMs: 0)
    _ = w.median(percent: 50.0, nowMs: 0)
    XCTAssertEqual(w.median(percent: 90.0, nowMs: 1_000), 90.0, accuracy: 0.001)
  }

  func testResetClearsTheWindow() {
    let w = SocMedianWindow(windowMs: 20_000)
    _ = w.median(percent: 10.0, nowMs: 0)
    _ = w.median(percent: 10.0, nowMs: 1_000)
    w.reset()
    XCTAssertEqual(w.median(percent: 80.0, nowMs: 2_000), 80.0, accuracy: 0.001)
  }

  func testDampsOscillationSoItStaysBelowTheReArmThreshold() {
    // Pack resting ~54%, responsive % swings 50..60 with load.
    let w = SocMedianWindow(windowMs: 20_000)
    let swing = [54.0, 60.0, 50.0, 58.0, 51.0, 59.0, 52.0, 57.0, 53.0, 56.0]
    var t: Int64 = 0
    var maxValue = -Double.greatestFiniteMagnitude
    for p in swing {
      maxValue = max(maxValue, w.median(percent: p, nowMs: t))
      t += 500
    }
    XCTAssertLessThan(maxValue, 58.0, "median flapped above re-arm threshold: \(maxValue)")
  }
}
