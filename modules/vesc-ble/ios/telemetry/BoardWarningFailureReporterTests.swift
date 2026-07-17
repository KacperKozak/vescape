import XCTest
@testable import VescBle

/// Crash-isolation contract for Board Warning DB failures (#214): a failing GRDB read/write must stay
/// non-fatal but leave one breadcrumb per (site, session) instead of the old silent `try?`. Verifies
/// the once-per-(site, session) throttle and its per-session reset.
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/BoardSessionController.kt `reportWarningFailure`
final class BoardWarningFailureReporterTests: XCTestCase {
  private struct StubError: Error {}

  private var events: [(String, [String: Any?])]!
  private var reporter: BoardWarningFailureReporter!

  override func setUp() {
    super.setUp()
    events = []
    reporter = BoardWarningFailureReporter { name, props in self.events.append((name, props)) }
  }

  override func tearDown() {
    events = nil
    reporter = nil
    super.tearDown()
  }

  func testReportsBoardWarningFailureOncePerSitePerSession() {
    reporter.report(site: "store_upsert", error: StubError())
    reporter.report(site: "store_upsert", error: StubError())

    XCTAssertEqual(events.count, 1)
    XCTAssertEqual(events[0].0, "board_warning_failure")
    XCTAssertEqual(events[0].1["site"] as? String, "store_upsert")
  }

  func testDistinctSitesEachReportOnce() {
    reporter.report(site: "store_upsert", error: StubError())
    reporter.report(site: "store_delete", error: StubError())

    XCTAssertEqual(events.count, 2)
    XCTAssertEqual(Set(events.map { $0.1["site"] as? String }), ["store_upsert", "store_delete"])
  }

  func testBeginSessionReArmsThrottle() {
    reporter.report(site: "store_upsert", error: StubError())
    reporter.beginSession()
    reporter.report(site: "store_upsert", error: StubError())

    XCTAssertEqual(events.count, 2)
  }
}
