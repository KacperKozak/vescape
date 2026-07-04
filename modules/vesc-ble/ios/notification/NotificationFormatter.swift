import Foundation

/// Pure title/body text for iOS ride-status notifications. Kept separate from delivery so the
/// wording can be unit-tested and stays aligned with Android's `NotificationFormatter` phrasing.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/notification/NotificationFormatter.kt
/// @platform-diff Android renders a single persistent foreground-service chip that mutates in
/// place; iOS emits discrete local notifications, so this formats one title/body per ride event
/// (connected / disconnected / fault) rather than a live status line.
internal enum NotificationFormatter {
  static func connected(deviceName: String?) -> (title: String, body: String) {
    ("Board connected", boardLabel(deviceName) + " is connected")
  }

  static func disconnected(deviceName: String?) -> (title: String, body: String) {
    ("Board disconnected", boardLabel(deviceName) + " lost connection")
  }

  static func fault(deviceName: String?, faultCode: Int) -> (title: String, body: String) {
    let suffix = faultCode > 0 ? " (code \(faultCode))" : ""
    return ("Fault detected", boardLabel(deviceName) + " reported a fault" + suffix)
  }

  private static func boardLabel(_ deviceName: String?) -> String {
    guard let deviceName, !deviceName.isEmpty else { return "Your board" }
    return deviceName
  }
}
