import XCTest
@testable import VescapeCore

/// The send/wait/paused decision, with no database, clock or network behind it.
/// @parity /modules/vescape-core/android/src/test/java/expo/modules/vescapecore/sync/SyncPolicyTest.kt
final class SyncPolicyTests: XCTestCase {
  private func state(
    pendingRows: Int = 1,
    ridingSamples: Bool = false,
    online: Bool = true,
    wifiOnly: Bool = false,
    onWifi: Bool = false,
    credentialReady: Bool = true,
    onlineBlocked: Bool = false,
    pause: SyncPauseReason? = nil,
    retryAtMs: Int64 = 0
  ) -> SyncState {
    SyncState(
      nowMs: 1_000,
      pendingRows: pendingRows,
      ridingSamples: ridingSamples,
      online: online,
      wifiOnly: wifiOnly,
      onWifi: onWifi,
      credentialReady: credentialReady,
      onlineBlocked: onlineBlocked,
      pause: pause,
      retryAtMs: retryAtMs
    )
  }

  func testPendingRowsOnALiveConnectionSendNow() {
    XCTAssertEqual(SyncPolicy.decide(state()), .sendNow)
  }

  func testCadenceFollowsSampleProductionNotSessionPresence() {
    XCTAssertEqual(
      SyncPolicy.decide(state(pendingRows: 0, ridingSamples: true)),
      .wait(atMs: 1_000 + SyncPolicy.rideIntervalMs)
    )
    XCTAssertEqual(
      SyncPolicy.decide(state(pendingRows: 0)),
      .wait(atMs: 1_000 + SyncPolicy.idleIntervalMs)
    )
  }

  /// Offline, metered and gated are pauses in the loop, never failures that move backoff.
  func testOfflineMeteredAndClosedGateAllWait() {
    let idle = SyncDecision.wait(atMs: 1_000 + SyncPolicy.idleIntervalMs)
    XCTAssertEqual(SyncPolicy.decide(state(online: false)), idle)
    XCTAssertEqual(SyncPolicy.decide(state(wifiOnly: true, onWifi: false)), idle)
    XCTAssertEqual(SyncPolicy.decide(state(onlineBlocked: true)), idle)
    XCTAssertEqual(SyncPolicy.decide(state(wifiOnly: true, onWifi: true)), .sendNow)
  }

  func testBackoffDeadlineHoldsTheLoopUntilItPasses() {
    XCTAssertEqual(SyncPolicy.decide(state(retryAtMs: 5_000)), .wait(atMs: 5_000))
    XCTAssertEqual(SyncPolicy.decide(state(retryAtMs: 999)), .sendNow)
  }

  func testAPauseIsNotBypassedByAnOrdinaryKick() {
    XCTAssertEqual(SyncPolicy.decide(state(pause: .protocolFailure)), .paused(.protocolFailure))
    XCTAssertEqual(SyncPolicy.decide(state(credentialReady: false)), .paused(.authentication))
  }

  func testBackoffDoublesFromTheFirstStepAndStopsAtTheCap() {
    XCTAssertEqual(SyncPolicy.nextBackoffMs(0), SyncPolicy.backoffStartMs)
    XCTAssertEqual(SyncPolicy.nextBackoffMs(30_000), 60_000)
    XCTAssertEqual(SyncPolicy.nextBackoffMs(SyncPolicy.backoffMaxMs), SyncPolicy.backoffMaxMs)
  }
}
