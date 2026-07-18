import XCTest
@testable import VescapeCore

/// @parity /modules/vescape-core/android/src/test/java/expo/modules/vescapecore/notification/NotificationPresenterTest.kt
final class RideActivityContentTests: XCTestCase {

  func testDeviceNameIsPartOfMutableContentState() {
    let renamed = RideActivityContent.state(
      deviceName: "Renamed ADV",
      phase: .connected,
      batteryPercent: 64,
      batteryVoltage: 75.13,
      faultCode: nil
    )

    XCTAssertEqual(renamed.deviceName, "Renamed ADV")
  }

  func testDeviceNameFallsBackToVesc() {
    let unnamed = RideActivityContent.state(
      deviceName: "",
      phase: .connecting,
      batteryPercent: nil,
      batteryVoltage: nil,
      faultCode: nil
    )

    XCTAssertEqual(unnamed.deviceName, "VESC")
  }

  func testStatusTextConnectedWithPercentIncludesVoltage() {
    XCTAssertEqual(
      RideActivityContent.statusText(
        phase: .connected, batteryPercent: 45, batteryVoltage: 75.13, faultCode: nil),
      "45% (75.1V)"
    )
  }

  func testStatusTextConnectedWithoutPercentFallsBackToVoltage() {
    XCTAssertEqual(
      RideActivityContent.statusText(
        phase: .connected, batteryPercent: nil, batteryVoltage: 75.13, faultCode: nil),
      "75.1V"
    )
  }

  func testStatusTextFaultTakesPrecedenceOverBattery() {
    XCTAssertEqual(
      RideActivityContent.statusText(
        phase: .connected, batteryPercent: 45, batteryVoltage: 75.13, faultCode: 7),
      "Fault detected (code 7)"
    )
  }

  func testShortCriticalConnectedPrefersPercent() {
    XCTAssertEqual(
      RideActivityContent.shortCritical(
        phase: .connected, batteryPercent: 45, batteryVoltage: 75.13, faultCode: nil),
      "45%"
    )
  }

  func testShortCriticalConnectedFallsBackToVoltage() {
    XCTAssertEqual(
      RideActivityContent.shortCritical(
        phase: .connected, batteryPercent: nil, batteryVoltage: 75.13, faultCode: nil),
      "75.1V"
    )
  }
}
