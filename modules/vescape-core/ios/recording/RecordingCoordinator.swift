import Foundation

/// Starts/stops iOS Ride Recording storage for the active Board Session.
///
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/recording/RecordingCoordinator.kt
/// @platform-diff iOS has no raw debug `SessionRecorder`; this coordinator owns only durable
/// telemetry recording until the debug-recording slice is ported.
internal final class RecordingCoordinator {
  private let store = TelemetryRepository.shared
  private let appData: AppDataRepository
  private var activeConfig: BoardConnectConfig?
  private var enabled = false
  private var startedAtMs: Int64?
  private var requestedTelemetryRecordingEnabled = false

  init(appData: AppDataRepository) {
    self.appData = appData
  }

  var telemetryRecordingEnabled: Bool { enabled }
  var activeBoardId: String? { enabled ? activeConfig?.appBoardId : nil }

  func beginBoardSession(config: BoardConnectConfig) {
    activeConfig = config
    store.resetSessionState()
    store.reloadPrivacyZones(appData.getEnabledPrivacyZoneEntities())
    store.applySettings(appData.getSettings())
    // `autoRecording` is honored at board-ready, not here — mirrors Android, which only enables
    // the telemetry store once the board is actually connected. Only an explicit JS request
    // (`setTelemetryRecordingEnabled`) starts recording this early.
    if requestedTelemetryRecordingEnabled {
      enableTelemetryRecording(config: config, emitConnectedMarker: false)
    } else {
      enabled = false
      startedAtMs = nil
    }
  }

  func markBoardReady(config: BoardConnectConfig) {
    activeConfig = config
    let autoRecording = appData.getSettings()["autoRecording"] as? Bool ?? false
    if autoRecording && !enabled {
      enableTelemetryRecording(config: config, emitConnectedMarker: false)
    }
    if enabled {
      recordMarker("connected", config: config)
    }
  }

  func updateBoardSessionConfig(_ config: BoardConnectConfig) {
    guard activeConfig?.appBoardId == config.appBoardId else { return }
    activeConfig = config
  }

  func finishBoardSession(markerType: String) {
    if let config = activeConfig, enabled {
      recordMarker(markerType, config: config)
    }
    store.flushBlocking()
    activeConfig = nil
    enabled = false
    startedAtMs = nil
  }

  func failSession() {
    store.flushBlocking()
    activeConfig = nil
    enabled = false
    startedAtMs = nil
  }

  func setTelemetryRecordingEnabled(_ requested: Bool) -> Bool {
    requestedTelemetryRecordingEnabled = requested
    guard let config = activeConfig else {
      enabled = false
      startedAtMs = nil
      return false
    }
    if requested {
      enableTelemetryRecording(config: config)
      return true
    }
    if enabled {
      recordMarker("app_stop", config: config, message: "Recording stopped")
    }
    store.flushBlocking()
    enabled = false
    startedAtMs = nil
    return true
  }

  func recordTelemetry(_ capture: TelemetryCapture) {
    guard enabled else { return }
    store.recordTelemetry(capture)
  }

  /// Marks where a Ride Recording entered an Idle Pause so the resulting gap is explained (ADR-0021).
  func recordIdlePauseMarker(config: BoardConnectConfig) {
    recordMarker("auto_pause", config: config, message: "Recording paused — idle")
  }

  func applySettings(_ settings: [String: Any?]) {
    store.applySettings(settings)
  }

  private func enableTelemetryRecording(config: BoardConnectConfig, emitConnectedMarker: Bool = true) {
    if !enabled {
      startedAtMs = nowMs()
      if emitConnectedMarker {
        recordMarker("connected", config: config)
      }
    }
    enabled = true
    activeConfig = config
    store.applySettings(appData.getSettings())
  }

  private func recordMarker(_ type: String, config: BoardConnectConfig, message: String? = nil) {
    store.recordMarker(type: type, deviceId: config.bleId, deviceName: config.name, message: message)
  }

  private func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000.0) }
}
