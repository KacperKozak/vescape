import XCTest
@testable import VescapeCore

final class BoardSessionLinkIntegrityTests: XCTestCase {
  private let complete = LinkIdentity(
    linkVersion: 3,
    hasBms: true,
    firmware: "FW 6.05",
    refloatVersion: "Refloat 3.0.7",
    refloatBaseVersion: "3.0.7"
  )

  func testCompleteLinkStartsChecking() {
    let session = BoardSession(id: 1)

    XCTAssertEqual(.checking, session.startLinkIntegrityCheck(expected: complete))
  }

  func testOldOrIncompleteLinkStartsOutdated() {
    let session = BoardSession(id: 1)

    let legacy = LinkIdentity(
      linkVersion: nil,
      hasBms: true,
      firmware: "FW 6.05",
      refloatVersion: "Refloat 3.0.7",
      refloatBaseVersion: "3.0.7"
    )
    XCTAssertEqual(.checking, session.startLinkIntegrityCheck(expected: legacy))
    XCTAssertEqual(.outdated, session.markOutdatedIfIncomplete(expected: legacy))
    XCTAssertEqual(.outdated, session.markOutdatedIfIncomplete(expected: LinkIdentity(
      linkVersion: 3,
      hasBms: nil,
      firmware: "FW 6.05",
      refloatVersion: "Refloat 3.0.7",
      refloatBaseVersion: "3.0.7"
    )))
  }

  func testMatchingFactsBecomeTrusted() {
    let session = BoardSession(id: 1)
    session.startLinkIntegrityCheck(expected: complete)

    XCTAssertEqual(.checking, session.observeFirmware(expected: complete, firmware: "FW 6.05"))
    XCTAssertEqual(.checking, session.observeRefloat(expected: complete, refloatVersion: "Refloat 3.0.7"))
    XCTAssertEqual(.trusted, session.observeBms(expected: complete))
  }

  func testMismatchedFactsLatchForSession() {
    let session = BoardSession(id: 1)
    session.startLinkIntegrityCheck(expected: complete)

    XCTAssertEqual(.mismatched, session.observeFirmware(expected: complete, firmware: "FW 6.06"))
    XCTAssertEqual(.mismatched, session.observeFirmware(expected: complete, firmware: "FW 6.05"))
  }

  func testExpectedBmsMissingMismatchesButFalseDoesNotNeedBms() {
    let withoutBms = LinkIdentity(
      linkVersion: 3,
      hasBms: false,
      firmware: "FW 6.05",
      refloatVersion: "Refloat 3.0.7",
      refloatBaseVersion: "3.0.7"
    )
    let trusted = BoardSession(id: 1)
    trusted.startLinkIntegrityCheck(expected: withoutBms)
    trusted.observeFirmware(expected: withoutBms, firmware: "FW 6.05")
    XCTAssertEqual(.trusted, trusted.observeRefloat(expected: withoutBms, refloatVersion: "Refloat 3.0.7"))
    XCTAssertEqual(.mismatched, trusted.observeBms(expected: withoutBms))

    let missingBms = BoardSession(id: 2)
    missingBms.startLinkIntegrityCheck(expected: complete)
    missingBms.observeFirmware(expected: complete, firmware: "FW 6.05")
    missingBms.observeRefloat(expected: complete, refloatVersion: "Refloat 3.0.7")
    XCTAssertEqual(.mismatched, missingBms.markBmsMissing(expected: complete))
  }
}
