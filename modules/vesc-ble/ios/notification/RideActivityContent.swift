import Foundation

/// Builds the Live Activity `ContentState` from the current Board Session snapshot. Kept separate
/// from delivery (`RideLiveActivityController`) so the phrasing can be unit-tested and stays aligned
/// with Android's notification wording.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/notification/NotificationFormatter.kt
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/BoardPhase.kt
enum RideActivityContent {
  static func state(
    phase: BoardPhase,
    batteryPercent: Int?,
    faultCode: Int?
  ) -> RideActivityAttributes.ContentState {
    RideActivityAttributes.ContentState(
      phase: phase.rawValue,
      statusText: statusText(phase: phase, batteryPercent: batteryPercent, faultCode: faultCode),
      shortCritical: shortCritical(phase: phase, batteryPercent: batteryPercent, faultCode: faultCode),
      batteryPercent: batteryPercent,
      faultCode: faultCode
    )
  }

  /// Primary status line. A fault takes precedence, then the battery segment once connected,
  /// otherwise the phase label. Mirrors Android `resolveText` + `displayText`.
  static func statusText(phase: BoardPhase, batteryPercent: Int?, faultCode: Int?) -> String {
    if let faultCode {
      return faultCode > 0 ? "Fault detected (code \(faultCode))" : "Fault detected"
    }
    if phase == .connected, let batteryPercent {
      return "\(batteryPercent)% battery"
    }
    return displayText(phase)
  }

  /// Compact glyph/percent for the Dynamic Island. Mirrors Android `shortCriticalSymbol` +
  /// `formatShortCriticalText`.
  static func shortCritical(phase: BoardPhase, batteryPercent: Int?, faultCode: Int?) -> String {
    if faultCode != nil { return "⚠" }
    switch phase {
    case .idle: return "—"
    case .connected: return batteryPercent.map { "\($0)%" } ?? "—"
    case .error: return "✕"
    case .connecting, .discovering, .subscribing, .waitingForTelemetry, .reconnecting, .rescanning:
      return "…"
    }
  }

  /// Phase label copy. Mirrors Android `BoardPhase.displayText`.
  static func displayText(_ phase: BoardPhase) -> String {
    switch phase {
    case .idle: return "Board not connected"
    case .connecting: return "Connecting…"
    case .discovering: return "Discovering…"
    case .subscribing: return "Subscribing…"
    case .waitingForTelemetry: return "Waiting for telemetry…"
    case .connected: return "Connected"
    case .reconnecting: return "Reconnecting…"
    case .rescanning: return "Searching…"
    case .error: return "Connection error"
    }
  }
}
