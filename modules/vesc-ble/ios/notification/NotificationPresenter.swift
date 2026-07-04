import Foundation
import UserNotifications

/// Delivers discrete local notifications for ride status (connected / disconnected / fault) via
/// `UNUserNotificationCenter`. Authorization is requested lazily on first use. Edge-triggering is
/// the caller's responsibility (`ConnectionCoordinator`); this type only formats and delivers.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/notification/NotificationPresenter.kt
/// @platform-diff Android drives a persistent foreground-service notification; iOS posts one-shot
/// local notifications and needs runtime authorization, so there is no long-lived chip to update.
internal final class NotificationPresenter {
  private let center: UNUserNotificationCenter

  init(center: UNUserNotificationCenter = .current()) {
    self.center = center
  }

  func notifyConnected(deviceName: String?) {
    let content = NotificationFormatter.connected(deviceName: deviceName)
    deliver(id: "ride.connected", title: content.title, body: content.body)
  }

  func notifyDisconnected(deviceName: String?) {
    let content = NotificationFormatter.disconnected(deviceName: deviceName)
    deliver(id: "ride.disconnected", title: content.title, body: content.body)
  }

  func notifyFault(deviceName: String?, faultCode: Int) {
    let content = NotificationFormatter.fault(deviceName: deviceName, faultCode: faultCode)
    deliver(id: "ride.fault", title: content.title, body: content.body)
  }

  /// Ensure authorization (requesting on first use), then post the notification. Denied/unknown
  /// authorization silently drops the notification rather than prompting repeatedly.
  private func deliver(id: String, title: String, body: String) {
    center.getNotificationSettings { [center] settings in
      switch settings.authorizationStatus {
      case .notDetermined:
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
          guard granted else { return }
          Self.post(center: center, id: id, title: title, body: body)
        }
      case .authorized, .provisional, .ephemeral:
        Self.post(center: center, id: id, title: title, body: body)
      default:
        return
      }
    }
  }

  private static func post(center: UNUserNotificationCenter, id: String, title: String, body: String) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    // Unique id per delivery so a new event never silently replaces the previous banner.
    let request = UNNotificationRequest(
      identifier: "\(id).\(Int(Date().timeIntervalSince1970 * 1000.0))",
      content: content,
      trigger: nil
    )
    center.add(request, withCompletionHandler: nil)
  }
}
