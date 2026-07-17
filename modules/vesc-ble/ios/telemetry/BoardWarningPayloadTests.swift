import XCTest
@testable import VescBle

/// Payload rounding parity: `BoardWarningPayload.round4` must round ties half away from zero on both
/// platforms so the same detector input serializes to the same wire value.
/// @parity /modules/vesc-ble/android/src/test/java/expo/modules/vescble/warnings/BoardWarningKindTest.kt
final class BoardWarningPayloadTests: XCTestCase {

  func testRound4RoundsTiesAwayFromZero() {
    XCTAssertEqual(BoardWarningPayload.round4(0.12345), 0.1235)
    XCTAssertEqual(BoardWarningPayload.round4(-0.12345), -0.1235)
  }

  func testRound4StripsFloatNoise() {
    XCTAssertEqual(BoardWarningPayload.round4(3.92 - 3.80), 0.12)
    XCTAssertEqual(BoardWarningPayload.round4(3.80 - 3.92), -0.12)
  }
}
