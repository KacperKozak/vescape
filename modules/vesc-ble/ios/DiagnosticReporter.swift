import Foundation

/// iOS diagnostic reporter surfaced to JS through `reportUiError` / `reportDiagnosticTest` /
/// `getDiagnosticStatus`. Tracks capture counters for the settings status panel exactly like
/// Android's `DiagnosticReporter`.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/DiagnosticReporter.kt
/// @platform-diff Android fans events out to a PostHog transport when an API key is configured;
/// iOS has no PostHog transport yet, so `enabled` is always `false` and captures are kept as Local
/// Diagnostic Events (ADR 0007) instead of being dropped on the floor.
internal final class DiagnosticReporter {
  static let shared = DiagnosticReporter()

  private static let defaultHost = "https://us.i.posthog.com"

  private let recorder: DiagnosticsRecorder
  private let lock = NSLock()
  private var captureCount = 0
  private var lastEventName: String?
  private var lastCaptureAt: Int64?

  init(recorder: DiagnosticsRecorder = .shared) {
    self.recorder = recorder
  }

  /// Count the capture (mirrors Android, which counts even when transport is disabled) and keep
  /// the breadcrumb in the local store since there is no remote sink on iOS.
  func capture(eventName: String, properties: [String: Any?] = [:]) {
    lock.lock()
    captureCount += 1
    lastEventName = eventName
    lastCaptureAt = Int64(Date().timeIntervalSince1970 * 1000.0)
    lock.unlock()
    recorder.record(eventName: eventName, properties: properties)
  }

  func status() -> [String: Any?] {
    lock.lock()
    defer { lock.unlock() }
    return [
      "enabled": false,
      "host": Self.defaultHost,
      // No remote identity without a configured transport (matches Android when the key is absent).
      "distinctId": nil,
      "captureCount": captureCount,
      "lastEventName": lastEventName,
      "lastCaptureAt": lastCaptureAt,
    ]
  }

  // MARK: - Bridge entry points

  func reportUiError(message: String, source: String?, stack: String?) {
    capture(eventName: "ui_error", properties: [
      "operation": "ui",
      "message": message,
      "source": source,
      "stack": stack,
    ])
  }

  func reportDiagnosticTest() -> [String: Any?] {
    capture(eventName: "diagnostic_test", properties: [
      "operation": "dev_diagnostics",
      "source": "settings_dev",
      "message": "Manual diagnostic test",
    ])
    return status()
  }
}
