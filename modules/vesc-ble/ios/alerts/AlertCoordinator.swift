import Foundation

/// Bridges the pure alert evaluator with the side-effectful audio player. Each telemetry frame is
/// evaluated against the loaded rules; geiger loops update/stop to track live rule activity, and
/// one-shot alerts play a triple-beep pattern (plus optional TTS message). Returns the fired
/// alert maps so the connection layer can attach them to the telemetry event payload.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/AlertCoordinator.kt
internal final class AlertCoordinator {
  private let engine = VescAlertEngine()
  private let player: AlertAudioPlayer
  private var rules: [AlertRule] = []
  private var activeGeigerRuleIds: Set<String> = []

  init(player: AlertAudioPlayer) {
    self.player = player
  }

  func replaceRules(_ value: [AlertRule]) {
    rules = value
    engine.resetDebounce()
  }

  func evaluate(
    telemetry: RefloatTelemetry,
    batteryPercent: Double?,
    onDiagnostic: @escaping DiagnosticSink
  ) -> [[String: Any?]] {
    let fired = engine.evaluate(rules: rules, telemetry: telemetry, batteryPercent: batteryPercent)

    for alert in fired where alert.controlId == "battery" && alert.rangeDepth == nil {
      onDiagnostic("battery_alert_fired", [
        "rule_id": alert.ruleId,
        "used_ir_compensated_percent": (batteryPercent != nil) as Any,
        "battery_percent": batteryPercent as Any,
        "battery_voltage": telemetry.batteryVoltage,
        "battery_current": telemetry.batteryCurrent,
        "threshold": alert.threshold,
        "threshold_max": alert.thresholdMax as Any,
      ])
    }

    let geiger = fired.filter { $0.rangeDepth != nil }
    let ids = Set(geiger.map { $0.ruleId })
    for ruleId in activeGeigerRuleIds.subtracting(ids) {
      player.stopGeiger(ruleId: ruleId)
    }
    activeGeigerRuleIds = ids
    for alert in geiger {
      player.updateGeiger(ruleId: alert.ruleId, soundType: alert.soundType, rangeDepth: alert.rangeDepth ?? 0)
    }

    let single = fired.filter { $0.rangeDepth == nil }
    if !single.isEmpty {
      if let alert = single.first(where: { $0.soundType.hasPrefix("tts:") && $0.thresholdMax == nil }) {
        let template = String(alert.soundType.dropFirst("tts:".count))
        let text = renderAlertMessageTemplate(template, alert: alert, batteryPercent: batteryPercent, onDiagnostic: onDiagnostic)
        if !text.isEmpty { player.speakMessage(text) }
      }
      for alert in single where !alert.soundType.hasPrefix("tts:") {
        player.playSingle(soundType: alert.soundType)
      }
      player.vibrate(rangeDepth: nil)
    }

    return fired.map { $0.toMap() }
  }

  func stopAllGeiger() {
    player.stopAllGeiger()
    activeGeigerRuleIds.removeAll(keepingCapacity: true)
  }
}