import ActivityKit

/// Live Activity contract for the Board Session status surface — the iOS peer of Android's
/// persistent foreground-service notification. One activity lives for the whole session; native
/// updates its `ContentState` as the session moves through phases, battery steps, and faults.
///
/// This single file is compiled into BOTH the `vescape-core` module pod (which drives it via
/// `RideLiveActivityController`, globbed in by the podspec) and the `ride-activity` widget extension
/// (which renders it — added to that target by `plugins/withLiveActivityAttributes.ts`). ActivityKit
/// matches the two separately-compiled copies by unqualified type name. Keep it dependency-free.
///
/// Deployment target is 17.0 (> ActivityKit's 16.1 floor), so no `@available` gating is needed.
///
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/notification/NotificationController.kt
struct RideActivityAttributes: ActivityAttributes {
  /// Dynamic session state, mutated in place for the life of the activity.
  struct ContentState: Codable, Hashable {
    /// Current board nickname. Lives in ContentState because ActivityKit attributes are immutable.
    var deviceName: String
    /// `BoardPhase` wire value (e.g. `connecting`, `connected`, `reconnecting`, `error`).
    var phase: String
    /// Primary human-readable status line (phase text, battery segment, or fault message).
    var statusText: String
    /// Compact glyph/percent for the Dynamic Island — mirrors Android's short-critical chip.
    var shortCritical: String
    /// Battery SoC Estimate percent for the progress bar, or `nil` before telemetry arrives.
    var batteryPercent: Int?
    /// Active fault code, or `nil` when the board reports no fault.
    var faultCode: Int?
  }

}
