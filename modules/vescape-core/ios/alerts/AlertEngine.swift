import Foundation

/// Alert rule persisted in GRDB (`alerts` table). Mirrors Android `AlertRuleEntity`.
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/TelemetryEntities.kt
internal struct AlertRule {
  let boardId: String
  let id: String
  let controlId: String
  let threshold: Double
  let thresholdMax: Double?
  let enabled: Bool
  let soundType: String
  let createdAt: Int64
  /// Free-text provenance tag mirroring TS `AlertRule.source`: `manual` (or nil) or `preset`.
  /// JS authors and regenerates preset rules; native only persists the string.
  let source: String?
}

/// Adds Legal Mode's per-Board speed warning to in-memory rules. No Alert Rule row is materialized.
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/alerts/AlertEngine.kt `withLegalModeOverlay`
internal func withLegalModeOverlay(
  _ rules: [AlertRule],
  boardId: String,
  enabled: Bool,
  warningSpeedKmh: Double?,
  limitSpeedKmh: Double?
) -> [AlertRule] {
  guard
    enabled,
    let warningSpeedKmh,
    let limitSpeedKmh,
    warningSpeedKmh > 0,
    limitSpeedKmh > warningSpeedKmh
  else { return rules }

  return rules + [
    AlertRule(
      boardId: boardId,
      id: "native:legal-mode:speed",
      controlId: "speed",
      threshold: warningSpeedKmh,
      thresholdMax: limitSpeedKmh,
      enabled: true,
      soundType: "preset:tick",
      createdAt: 0,
      source: nil
    ),
  ]
}

/// One fired alert surfaced to JS through the telemetry event payload.
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/alerts/AlertEngine.kt `FiredAlert`
internal struct FiredAlert {
  let ruleId: String
  let controlId: String
  let value: Double
  let threshold: Double
  let thresholdMax: Double?
  let soundType: String
  let rangeDepth: Double?
  let firedAt: Int64

  func toMap() -> [String: Any?] {
    [
      "ruleId": ruleId,
      "controlId": controlId,
      "value": value,
      "threshold": threshold,
      "thresholdMax": thresholdMax,
      "soundType": soundType,
      "rangeDepth": rangeDepth,
      "firedAt": firedAt,
    ]
  }
}

/// Per-control unit / decimal / direction definition for alert value extraction and message
/// template rendering. Mirrors Android `telemetryMetricByControlId`.
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/TelemetryMetrics.kt
internal struct TelemetryMetricDef {
  let controlId: String
  let unit: String
  let decimals: Int
  let alertAbove: Bool

  func formatValue(_ value: Double) -> String {
    String(format: "%.\(decimals)f", value)
  }
}

internal let telemetryMetricDefs: [TelemetryMetricDef] = [
  .init(controlId: "speed", unit: "km/h", decimals: 0, alertAbove: true),
  .init(controlId: "battery", unit: "V", decimals: 1, alertAbove: false),
  .init(controlId: "duty", unit: "%", decimals: 0, alertAbove: true),
  .init(controlId: "motor-temp", unit: "°C", decimals: 0, alertAbove: true),
  .init(controlId: "motor-current", unit: "A", decimals: 0, alertAbove: true),
  .init(controlId: "controller-temp", unit: "°C", decimals: 0, alertAbove: true),
  .init(controlId: "batt-current", unit: "A", decimals: 0, alertAbove: true),
  .init(controlId: "imu", unit: "°", decimals: 1, alertAbove: true),
]

internal let telemetryMetricByControlId: [String: TelemetryMetricDef] = Dictionary(
  uniqueKeysWithValues: telemetryMetricDefs.map { ($0.controlId, $0) }
)

internal func alertControlUnit(_ controlId: String) -> String {
  telemetryMetricByControlId[controlId]?.unit ?? ""
}

internal func formatAlertValue(_ value: Double, _ controlId: String) -> String {
  telemetryMetricByControlId[controlId]?.formatValue(value) ?? String(format: "%.0f", value)
}

internal typealias DiagnosticSink = (String, [String: Any?]) -> Void

private func collectUnknownPlaceholders(in text: String) -> [String] {
  var results: [String] = []
  var current = ""
  var inside = false
  for ch in text {
    if ch == "{" {
      inside = true
      current = "{"
    } else if inside {
      current.append(ch)
      if ch == "}" {
        if !results.contains(current) { results.append(current) }
        inside = false
        current = ""
      }
    }
  }
  return results
}

private func stripPlaceholders(in text: String) -> String {
  var result = ""
  var skip = false
  for ch in text {
    if ch == "{" { skip = true; continue }
    if skip {
      if ch == "}" { skip = false }
      continue
    }
    result.append(ch)
  }
  return result
}

/// Render an Alert Message Template against a fired alert. Mirrors Android
/// `renderAlertMessageTemplate`; reports unavailable/unknown placeholders through the diagnostic
/// sink so missing values surface in the diagnostic stream instead of silently truncating text.
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/alerts/AlertEngine.kt `renderAlertMessageTemplate`
internal func renderAlertMessageTemplate(
  _ template: String,
  alert: FiredAlert,
  batteryPercent: Double?,
  onDiagnostic: DiagnosticSink? = nil
) -> String {
  let isBattery = alert.controlId == "battery"
  var text = template
  text = text.replacingOccurrences(
    of: "{value}",
    with: formatAlertValue(alert.value, alert.controlId)
  )
  text = text.replacingOccurrences(
    of: "{threshold}",
    with: formatAlertValue(alert.threshold, alert.controlId)
  )
  text = text.replacingOccurrences(of: "{unit}", with: alertControlUnit(alert.controlId))
  if isBattery {
    text = text.replacingOccurrences(
      of: "{voltage}",
      with: formatAlertValue(alert.value, alert.controlId)
    )
    if let batteryPercent {
      text = text.replacingOccurrences(of: "{percent}", with: String(format: "%.0f", batteryPercent))
    } else if text.contains("{percent}") {
      onDiagnostic?("alert_template_placeholder_unavailable", [
        "placeholder": "{percent}",
        "rule_id": alert.ruleId,
        "control_id": alert.controlId,
      ])
      text = text.replacingOccurrences(of: "{percent}", with: "")
    }
  } else {
    for placeholder in ["{voltage}", "{percent}"] {
      if text.contains(placeholder) {
        onDiagnostic?("alert_template_placeholder_unavailable", [
          "placeholder": placeholder,
          "rule_id": alert.ruleId,
          "control_id": alert.controlId,
        ])
        text = text.replacingOccurrences(of: placeholder, with: "")
      }
    }
  }
  if text.contains("{") {
    let unknowns = collectUnknownPlaceholders(in: text)
    if !unknowns.isEmpty {
      onDiagnostic?("alert_template_unknown_placeholder", [
        "placeholders": unknowns.joined(separator: ","),
        "rule_id": alert.ruleId,
      ])
      text = stripPlaceholders(in: text)
    }
  }
  return text.trimmingCharacters(in: .whitespaces)
}

/// Pure alert evaluator. No audio, no side effects. Mirrors Android `AlertEngine`.
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/alerts/AlertEngine.kt `AlertEngine`
internal final class AlertEngine {
  static let batteryHysteresisPercent: Double = 10.0

  private var lastFiredAt: [String: Int64] = [:]
  private var armedState: [String: Bool] = [:]

  func resetDebounce() {
    lastFiredAt.removeAll(keepingCapacity: true)
    armedState.removeAll(keepingCapacity: true)
  }

  func evaluate(
    rules: [AlertRule],
    telemetry t: RefloatTelemetry,
    batteryPercent: Double? = nil
  ) -> [FiredAlert] {
    guard !rules.isEmpty else { return [] }
    let now = nowMs()
    var fired: [FiredAlert] = []

    if let batteryPercent {
      for rule in rules where rule.controlId == "battery" && rule.thresholdMax == nil {
        if armedState[rule.id] == false
          && batteryPercent > rule.threshold + Self.batteryHysteresisPercent {
          armedState[rule.id] = true
        }
      }
    }

    for rule in rules {
      guard let value = extractAlertValue(rule.controlId, t) else { continue }
      let compareValue = (rule.controlId == "battery" && batteryPercent != nil) ? batteryPercent! : value
      let aboveDir = alertDirectionIsAbove(rule.controlId)
      let triggered = aboveDir ? compareValue >= rule.threshold : compareValue <= rule.threshold
      if !triggered { continue }
      let rangeDepth = alertRangeDepth(compareValue, threshold: rule.threshold, thresholdMax: rule.thresholdMax, aboveDir: aboveDir)
      if rangeDepth == nil {
        if rule.controlId == "battery" && batteryPercent != nil {
          if armedState[rule.id] == false { continue }
          armedState[rule.id] = false
        } else {
          let last = lastFiredAt[rule.id] ?? 0
          if now - last < 10_000 { continue }
          lastFiredAt[rule.id] = now
        }
      }
      fired.append(FiredAlert(
        ruleId: rule.id,
        controlId: rule.controlId,
        value: value,
        threshold: rule.threshold,
        thresholdMax: rule.thresholdMax,
        soundType: rule.soundType,
        rangeDepth: rangeDepth,
        firedAt: now
      ))
    }

    return fired.sorted { a, b in
      let aDepth = a.rangeDepth != nil
      let bDepth = b.rangeDepth != nil
      if aDepth != bDepth { return aDepth && !bDepth }
      let aAbove = alertDirectionIsAbove(a.controlId)
      let bAbove = alertDirectionIsAbove(b.controlId)
      let aKey = aAbove ? a.threshold : -a.threshold
      let bKey = bAbove ? b.threshold : -b.threshold
      return aKey > bKey
    }
  }

  private func alertDirectionIsAbove(_ controlId: String) -> Bool {
    telemetryMetricByControlId[controlId]?.alertAbove ?? true
  }

  private func alertRangeDepth(
    _ value: Double,
    threshold: Double,
    thresholdMax: Double?,
    aboveDir: Bool
  ) -> Double? {
    guard let thresholdMax, thresholdMax != threshold else { return nil }
    let span = aboveDir ? (thresholdMax - threshold) : (threshold - thresholdMax)
    guard span > 0 else { return nil }
    let depth = aboveDir ? (value - threshold) : (threshold - value)
    return min(max(depth / span, 0.0), 1.0)
  }

  private func extractAlertValue(_ controlId: String, _ t: RefloatTelemetry) -> Double? {
    switch controlId {
    case "speed": return abs(t.speed)
    case "battery": return t.batteryVoltage
    case "duty": return abs(t.dutyCycle) * 100.0
    case "motor-temp": return t.tempMotor.flatMap { $0 > 0 ? $0 : nil }
    case "motor-current": return t.motorCurrent
    case "controller-temp": return t.tempMosfet
    case "batt-current": return t.batteryCurrent
    case "imu": return t.pitch
    case "footpad": return t.adc1
    default: return nil
    }
  }

  private func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
}
