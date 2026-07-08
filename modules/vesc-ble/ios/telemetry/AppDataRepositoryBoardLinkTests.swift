import XCTest
@testable import VescBle

final class AppDataRepositoryBoardLinkTests: XCTestCase {
  private func roundTrip(_ link: [String: Any?]) -> [String: Any?]? {
    let normalized = BoardLinkPersistence.normalized(link)
    let bleId = normalized?["bleId"] as? String
    let storedTransport = BoardTransport.encode(BoardTransport.fromBridge(normalized?["transport"] ?? nil))
    var values: [String: Any] = [:]
    for (key, value) in BoardLinkPersistence.settings(from: link) where key != "transport" {
      if let value { values[key] = value }
    }
    return BoardLinkPersistence.compose(bleId: bleId, storedTransport: storedTransport, values: values)
  }

  func testV3IdentityFieldsSurviveRoundTrip() {
    let link = roundTrip([
      "bleId": "AA:BB",
      "transport": "direct",
      "linkVersion": 3,
      "hasBms": true,
      "vescFirmwareVersion": "FW 6.05",
      "refloatVersion": "2.1.0",
      "refloatBaseVersion": "1.4.0",
      "linkIntegrity": "trusted",
      "futureField": "ignored",
    ])

    XCTAssertEqual(link?["bleId"] as? String, "AA:BB")
    XCTAssertEqual(link?["transport"] as? String, "direct")
    XCTAssertEqual(link?["linkVersion"] as? Int, 3)
    XCTAssertEqual(link?["hasBms"] as? Bool, true)
    XCTAssertEqual(link?["vescFirmwareVersion"] as? String, "FW 6.05")
    XCTAssertEqual(link?["refloatVersion"] as? String, "2.1.0")
    XCTAssertEqual(link?["refloatBaseVersion"] as? String, "1.4.0")
    XCTAssertEqual(link?["linkIntegrity"] as? String, "trusted")
    XCTAssertNil(link?["futureField"] ?? nil)
  }

  func testV3WithoutIntegrityDefaultsUnknown() {
    let link = roundTrip([
      "bleId": "AA:BB",
      "transport": 84,
      "linkVersion": 3,
      "hasBms": false,
      "vescFirmwareVersion": "FW 6.05",
      "refloatVersion": "2.1.0",
      "refloatBaseVersion": "1.4.0",
    ])

    XCTAssertEqual(link?["linkIntegrity"] as? String, "unknown")
    XCTAssertEqual(link?["hasBms"] as? Bool, false)
  }

  func testLegacyBleIdAndTransportReadsAsOutdatedTelemetryCapableLink() {
    let link = roundTrip([
      "bleId": "AA:BB",
      "transport": 84,
    ])

    XCTAssertNotNil(link)
    XCTAssertEqual(link?["bleId"] as? String, "AA:BB")
    XCTAssertEqual(link?["transport"] as? Int, 84)
    XCTAssertNil(link?["hasBms"] ?? nil)
    XCTAssertEqual(link?["linkIntegrity"] as? String, "outdated")
  }

  func testMalformedLinkIsIgnored() {
    XCTAssertNil(roundTrip(["bleId": "", "transport": 84]))
    XCTAssertNil(roundTrip(["bleId": "AA:BB", "transport": 999]))
  }
}
