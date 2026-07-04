import ActivityKit
import Foundation

/// Drives the single Board Session Live Activity — the iOS peer of Android's persistent
/// foreground-service notification (`VescNotificationController`). One activity per session:
/// `start` on session begin, `update` on phase / battery / fault changes, `end` on teardown.
///
/// All work happens natively so the surface survives screen-off and a dead JS runtime, exactly like
/// the Android foreground notification. ActivityKit `update`/`end` are background-safe; the initial
/// `start` must run while the app is foreground, which holds because a session always begins from a
/// user-initiated connect.
///
/// Deployment target is 16.4, so ActivityKit is unconditionally available (no `@available` gating).
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescNotificationController.kt
/// @platform-diff Android renders a system notification with Disconnect/Connect/Exit actions; the
/// iOS Live Activity is tap-to-open only. Interactive buttons need App Intents (iOS 17+); revisit
/// when the deployment floor rises. TODO(iOS parity): Live Activity action buttons via App Intents.
final class RideLiveActivityController {
  private var activity: Activity<RideActivityAttributes>?

  /// Whether the OS + user allow Live Activities right now.
  private var enabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

  /// Begin the session activity. No-op (after ending any stray prior activity) when disabled, so a
  /// single activity is guaranteed. Must be called while the app is foreground.
  func start(deviceName: String?, state: RideActivityAttributes.ContentState) {
    end()
    guard enabled else { return }
    let attributes = RideActivityAttributes(deviceName: boardLabel(deviceName))
    do {
      activity = try Activity.request(
        attributes: attributes,
        content: .init(state: state, staleDate: nil)
      )
    } catch {
      // Denied authorization or a background start race — drop silently, mirroring Android's
      // best-effort notify. The session itself is unaffected.
      activity = nil
    }
  }

  /// Push a new snapshot to the running activity. Background-safe; a no-op when none is running.
  func update(_ state: RideActivityAttributes.ContentState) {
    guard let activity else { return }
    Task { await activity.update(.init(state: state, staleDate: nil)) }
  }

  /// End and immediately dismiss the activity. Idempotent.
  func end() {
    guard let activity else { return }
    self.activity = nil
    Task { await activity.end(nil, dismissalPolicy: .immediate) }
  }

  private func boardLabel(_ deviceName: String?) -> String {
    guard let deviceName, !deviceName.isEmpty else { return "VESC" }
    return deviceName
  }
}
