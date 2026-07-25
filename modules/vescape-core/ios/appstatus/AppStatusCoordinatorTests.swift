import XCTest
@testable import VescapeCore

/// App Status lifecycle: header + route, refresh coalescing, fail-open startup, and retention of a
/// successful in-process result across later failures.
/// @parity /modules/vescape-core/android/src/test/java/expo/modules/vescapecore/appstatus/AppStatusCoordinatorTest.kt
final class AppStatusCoordinatorTests: XCTestCase {
  /// Records every request and hands each one's completion back for manual resolution.
  private final class RecordingTransport {
    var urls: [String] = []
    var versions: [String] = []
    private var pending: [(Data?) -> Void] = []

    var inFlight: Int { pending.count }

    lazy var transport: AppStatusTransport = { [unowned self] url, appVersion, onResult in
      self.urls.append(url)
      self.versions.append(appVersion)
      self.pending.append(onResult)
    }

    func resolveAll(_ body: Data?) {
      let callbacks = pending
      pending.removeAll()
      for callback in callbacks { callback(body) }
    }
  }

  private func coordinator(
    _ transport: RecordingTransport,
    installedVersion: String = "0.70.0"
  ) -> AppStatusCoordinator {
    AppStatusCoordinator(
      installedVersion: installedVersion,
      baseUrl: "https://api.vescape.app",
      transport: transport.transport
    )
  }

  private func statusBody(_ status: String, latest: String = "0.80.2") -> Data {
    Data(#"{"version":{"installed":"0.70.0","latest":"\#(latest)","status":"\#(status)"},"messages":[]}"#.utf8)
  }

  func testRequestsTheAppStatusRouteWithTheInstalledMarketingVersion() {
    let transport = RecordingTransport()

    coordinator(transport).refresh()

    XCTAssertEqual(transport.urls, ["https://api.vescape.app/api/app-status"])
    XCTAssertEqual(transport.versions, ["0.70.0"])
  }

  func testDuplicateForegroundRefreshesShareOneInFlightRequest() {
    let transport = RecordingTransport()
    let coordinator = coordinator(transport)

    coordinator.refresh()
    coordinator.refresh()
    coordinator.refresh()

    XCTAssertEqual(transport.inFlight, 1)
    XCTAssertEqual(transport.urls.count, 1)

    // Once it settles, the next foreground starts a fresh request.
    transport.resolveAll(statusBody("current"))
    coordinator.refresh()
    XCTAssertEqual(transport.urls.count, 2)
  }

  func testStartsUnknownAndStaysUnknownWhenTheFirstFetchFails() {
    let transport = RecordingTransport()
    let coordinator = coordinator(transport)
    var changes = 0
    coordinator.onChange = { _ in changes += 1 }

    XCTAssertNil(coordinator.current)
    coordinator.refresh()
    transport.resolveAll(nil)

    XCTAssertNil(coordinator.current)
    XCTAssertEqual(changes, 0)
  }

  func testAnInvalidResponseFailsOpenExactlyLikeATransportFailure() {
    let transport = RecordingTransport()
    let coordinator = coordinator(transport)

    coordinator.refresh()
    transport.resolveAll(Data(#"{"version":{"installed":"0.70.0"}}"#.utf8))

    XCTAssertNil(coordinator.current)
  }

  func testASuccessfulResultSurvivesALaterFailedRefresh() {
    let transport = RecordingTransport()
    let coordinator = coordinator(transport)
    var seen: [AppVersionStatus?] = []
    coordinator.onChange = { seen.append($0?.version.status) }

    coordinator.refresh()
    transport.resolveAll(statusBody("online-blocked"))
    XCTAssertEqual(coordinator.current?.version.status, .onlineBlocked)

    coordinator.refresh()
    transport.resolveAll(nil)
    XCTAssertEqual(coordinator.current?.version.status, .onlineBlocked)
    XCTAssertEqual(seen, [.onlineBlocked])
  }

  func testALaterSuccessReplacesThePreviousResult() {
    let transport = RecordingTransport()
    let coordinator = coordinator(transport)

    coordinator.refresh()
    transport.resolveAll(statusBody("update-warning"))
    coordinator.refresh()
    transport.resolveAll(statusBody("current", latest: "0.81.0"))

    XCTAssertEqual(coordinator.current?.version.status, .current)
    XCTAssertEqual(coordinator.current?.version.latest, "0.81.0")
  }

  func testAnUnreadableInstalledVersionNeverFetches() {
    let transport = RecordingTransport()

    coordinator(transport, installedVersion: "").refresh()

    XCTAssertTrue(transport.urls.isEmpty)
  }
}
