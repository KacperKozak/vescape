import XCTest

@testable import VescBle

/// Mirrors android `IdlePauseDetectorTest.kt` 1:1 (ADR-0021 parity).
final class IdlePauseDetectorTests: XCTestCase {
  private let threshold = 300 // 3 km/h in centi-km/h, the default moving threshold

  func testDoesNotPauseBeforeIdleWindowElapses() {
    let d = IdlePauseDetector(pauseAfterMs: 30_000)
    XCTAssertNil(d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 0))
    XCTAssertNil(d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 29_999))
    XCTAssertFalse(d.isPaused)
  }

  func testPausesAfterContinuousNonMovingTimeReachesWindow() {
    let d = IdlePauseDetector(pauseAfterMs: 30_000)
    _ = d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 0)
    XCTAssertEqual(.paused, d.onSample(speedCentiKmh: 50, movingThresholdCentiKmh: threshold, atMs: 30_000))
    XCTAssertTrue(d.isPaused)
  }

  func testMovingSampleMidWindowResetsIdleTimer() {
    let d = IdlePauseDetector(pauseAfterMs: 30_000)
    _ = d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 0)
    _ = d.onSample(speedCentiKmh: 500, movingThresholdCentiKmh: threshold, atMs: 20_000) // moving -> resets
    XCTAssertNil(d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 45_000)) // only 25s since reset
    XCTAssertFalse(d.isPaused)
  }

  func testSpeedAtExactlyThresholdCountsAsMoving() {
    let d = IdlePauseDetector(pauseAfterMs: 30_000)
    _ = d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 0)
    XCTAssertNil(d.onSample(speedCentiKmh: threshold, movingThresholdCentiKmh: threshold, atMs: 30_000))
    XCTAssertFalse(d.isPaused)
  }

  func testResumesInstantlyOnFirstMovingSampleAfterPause() {
    let d = IdlePauseDetector(pauseAfterMs: 30_000)
    _ = d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 0)
    _ = d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 30_000) // pause
    XCTAssertEqual(.resumed, d.onSample(speedCentiKmh: 400, movingThresholdCentiKmh: threshold, atMs: 60_000))
    XCTAssertFalse(d.isPaused)
  }

  func testStaysPausedWhileStillNonMovingAndEmitsNoRepeatTransition() {
    let d = IdlePauseDetector(pauseAfterMs: 30_000)
    _ = d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 0)
    _ = d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 30_000) // pause
    XCTAssertNil(d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 31_000))
    XCTAssertNil(d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 120_000))
    XCTAssertTrue(d.isPaused)
  }

  func testNegativeSpeedBeyondThresholdCountsAsMoving() {
    let d = IdlePauseDetector(pauseAfterMs: 30_000)
    _ = d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 0)
    XCTAssertNil(d.onSample(speedCentiKmh: -500, movingThresholdCentiKmh: threshold, atMs: 30_000))
    XCTAssertFalse(d.isPaused)
  }

  func testRePausesAfterAResume() {
    let d = IdlePauseDetector(pauseAfterMs: 30_000)
    _ = d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 0)
    _ = d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 30_000) // pause
    _ = d.onSample(speedCentiKmh: 400, movingThresholdCentiKmh: threshold, atMs: 31_000) // resume
    _ = d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 31_000)
    XCTAssertEqual(.paused, d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 61_000))
  }

  func testThresholdOfZeroTreatsEverySampleAsMovingSoNeverPauses() {
    let d = IdlePauseDetector(pauseAfterMs: 30_000)
    XCTAssertNil(d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: 0, atMs: 0))
    XCTAssertNil(d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: 0, atMs: 60_000))
    XCTAssertFalse(d.isPaused)
  }

  func testResetClearsPauseAndTimer() {
    let d = IdlePauseDetector(pauseAfterMs: 30_000)
    _ = d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 0)
    _ = d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 30_000) // pause
    d.reset()
    XCTAssertFalse(d.isPaused)
    XCTAssertNil(d.onSample(speedCentiKmh: 0, movingThresholdCentiKmh: threshold, atMs: 31_000)) // timer restarted
  }
}
