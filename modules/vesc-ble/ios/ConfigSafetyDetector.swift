import Foundation

/// Decoded Refloat config values the safety rules evaluate. A `nil` field means the schema did not
/// carry it (or the raw config was too short) — the rules that need it are skipped, never guessed.
struct ConfigSafetyValues {
  let faultAdc1: Double?
  let faultAdc2: Double?
  let tiltbackLv: Double?
  let tiltbackHv: Double?
  let tiltbackDuty: Double?
  let movingFaultDisabled: Bool?
}

/// Two-level config-rule severity. Mapped to `BoardWarningRegistry.Severity` by the session controller.
enum ConfigRuleSeverity {
  case warn
  case critical
}

/// One config-safety finding to report through the Board Warning registry.
struct ConfigSafetyFinding {
  let kind: String
  let severity: ConfigRuleSeverity
  let payloadJson: String
}

/// Outcome of one config evaluation. `findings` are the rules that tripped; `cleanKinds` are the rules
/// that evaluated with real data and were fine (so the registry auto-clears them, fault-code model). A
/// rule whose inputs were absent appears in neither list — it is skipped, leaving any stored warning
/// untouched.
struct ConfigSafetyReport {
  let findings: [ConfigSafetyFinding]
  let cleanKinds: [String]
}

/// Config-scoped Board Warning detector: pure rules over the decoded Refloat safety config plus the
/// board's configured battery series count. Pure evaluation logic per the pure-native-logic ADR; the
/// background config read, series-count lookup, and registry reporting stay in the session controller.
///
/// Thresholds are native constants. Per-cell rules (`kindLv`, `kindHv`) need the configured series
/// count and are skipped when it is absent; the other three still run. A rule whose config field is
/// missing from the schema is likewise skipped. Every payload carries the offending parameter, its
/// current value, and the safe bound so the UI can explain the finding.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/ConfigSafetyDetector.kt
enum ConfigSafetyDetector {
  static let kindFootpad = "footpad-disabled"
  static let kindLv = "lv-pushback-low"
  static let kindHv = "hv-pushback-high"
  static let kindDuty = "duty-pushback-high"
  static let kindMovingFault = "moving-fault-disabled"

  /// Minimum safe low-voltage pushback per cell (V). LV pushback under `this × series` is unsafe.
  static let cellLvMinV = 3.0
  /// Maximum safe high-voltage pushback per cell (V). HV pushback over `this × series` is unsafe.
  static let cellHvMaxV = 4.3
  /// Maximum safe duty-cycle pushback threshold (fraction). VESC max duty is 0.95.
  static let dutyMax = 0.85

  static func evaluate(_ values: ConfigSafetyValues, seriesCount: Int?) -> ConfigSafetyReport {
    var findings: [ConfigSafetyFinding] = []
    var clean: [String] = []

    // footpad-disabled (critical): both ADC switch voltages 0 disables the footpad switch entirely.
    if let adc1 = values.faultAdc1, let adc2 = values.faultAdc2 {
      if adc1 == 0.0, adc2 == 0.0 {
        findings.append(finding(kindFootpad, .critical, "fault_adc1/fault_adc2", 0.0, 0.0))
      } else {
        clean.append(kindFootpad)
      }
    }

    // lv-pushback-low (critical): LV pushback below the safe per-cell minimum. Needs series count.
    if let lv = values.tiltbackLv, let seriesCount {
      let bound = cellLvMinV * Double(seriesCount)
      if lv < bound {
        findings.append(finding(kindLv, .critical, "tiltback_lv", lv, bound))
      } else {
        clean.append(kindLv)
      }
    }

    // hv-pushback-high (warn): HV pushback above the safe per-cell maximum. Needs series count.
    if let hv = values.tiltbackHv, let seriesCount {
      let bound = cellHvMaxV * Double(seriesCount)
      if hv > bound {
        findings.append(finding(kindHv, .warn, "tiltback_hv", hv, bound))
      } else {
        clean.append(kindHv)
      }
    }

    // duty-pushback-high (warn): duty pushback threshold set dangerously close to the duty limit.
    if let duty = values.tiltbackDuty {
      if duty > dutyMax {
        findings.append(finding(kindDuty, .warn, "tiltback_duty", duty, dutyMax))
      } else {
        clean.append(kindDuty)
      }
    }

    // moving-fault-disabled (warn): moving faults disabled weakens fault protection while riding.
    if let movingFault = values.movingFaultDisabled {
      if movingFault {
        findings.append(finding(kindMovingFault, .warn, "fault_moving_fault_disabled", 1.0, 0.0))
      } else {
        clean.append(kindMovingFault)
      }
    }

    return ConfigSafetyReport(findings: findings, cleanKinds: clean)
  }

  private static func finding(
    _ kind: String,
    _ severity: ConfigRuleSeverity,
    _ param: String,
    _ value: Double,
    _ bound: Double
  ) -> ConfigSafetyFinding {
    ConfigSafetyFinding(kind: kind, severity: severity, payloadJson: payloadJson(param, value, bound))
  }

  private static func payloadJson(_ param: String, _ value: Double, _ bound: Double) -> String {
    let v = String(format: "%.4f", value)
    let b = String(format: "%.4f", bound)
    return "{\"param\":\"\(param)\",\"value\":\(v),\"bound\":\(b)}"
  }
}
