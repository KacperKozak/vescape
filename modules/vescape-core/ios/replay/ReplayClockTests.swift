import XCTest
@testable import VescapeCore

private let warmupMs: Int64 = 180_000

/// @parity /modules/vescape-core/android/src/test/java/expo/modules/vescapecore/replay/ReplayClockTest.kt
final class ReplayClockTests: XCTestCase {
  private func wallMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

  func testStartsAFullWarmupWindowInThePast() {
    let clock = ReplayClock(warmupMs: warmupMs)

    let behindMs = wallMs() - clock.nowMs()

    XCTAssertEqual(Double(behindMs), Double(warmupMs), accuracy: 500)
  }

  /// The point of the whole design: a warmup dispatched in an instant still has to stamp its
  /// samples across the window they actually cover, or the live charts stay empty.
  func testSpreadsAnInstantWarmupAcrossTheRecordedWindow() {
    let clock = ReplayClock(warmupMs: warmupMs)
    let playbackStartedAtMs = wallMs()

    clock.advanceWarmup(recordedT: 0, playbackStartedAtMs: playbackStartedAtMs)
    let first = clock.nowMs()
    clock.advanceWarmup(recordedT: warmupMs / 2, playbackStartedAtMs: playbackStartedAtMs)
    let middle = clock.nowMs()

    XCTAssertEqual(Double(first), Double(playbackStartedAtMs - warmupMs), accuracy: 500)
    XCTAssertEqual(Double(middle), Double(playbackStartedAtMs - warmupMs / 2), accuracy: 500)
  }

  func testHoldsItsOffsetOnceTheWarmupStopsAdvancingIt() {
    let clock = ReplayClock(warmupMs: warmupMs)
    clock.advanceWarmup(recordedT: warmupMs, playbackStartedAtMs: wallMs())

    let offsetAfterWarmup = clock.nowMs() - wallMs()
    Thread.sleep(forTimeInterval: 0.03)
    let offsetLater = clock.nowMs() - wallMs()

    // Frozen offset means the session clock now advances at exactly wall-clock rate, which is what
    // keeps the rest of playback running at 1x.
    XCTAssertEqual(Double(offsetAfterWarmup), Double(offsetLater), accuracy: 20)
  }

  func testNeverStepsBackwardsWhenTheWarmupFallsBehindRealTime() {
    let clock = ReplayClock(warmupMs: warmupMs)
    let playbackStartedAtMs = wallMs()
    clock.advanceWarmup(recordedT: warmupMs / 2, playbackStartedAtMs: playbackStartedAtMs)
    let ahead = clock.nowMs()

    // A warmup slower than real time would pull the offset back; the clamp has to absorb it.
    clock.advanceWarmup(recordedT: 0, playbackStartedAtMs: playbackStartedAtMs)

    XCTAssertGreaterThanOrEqual(clock.nowMs(), ahead)
  }
}
