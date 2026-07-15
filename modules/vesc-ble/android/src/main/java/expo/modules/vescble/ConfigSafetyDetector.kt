package expo.modules.vescble

import java.util.Locale

/**
 * Decoded Refloat config values the safety rules evaluate. A `null` field means the schema did not
 * carry it (or the raw config was too short) — the rules that need it are skipped, never guessed.
 */
data class ConfigSafetyValues(
  val faultAdc1: Double?,
  val faultAdc2: Double?,
  val tiltbackLv: Double?,
  val tiltbackHv: Double?,
  val tiltbackDuty: Double?,
  val movingFaultDisabled: Boolean?,
)

/** Two-level config-rule severity. Mapped to [BoardWarningSeverity] by the session controller. */
enum class ConfigRuleSeverity { WARN, CRITICAL }

/** One config-safety finding to report through the Board Warning registry. */
data class ConfigSafetyFinding(
  val kind: String,
  val severity: ConfigRuleSeverity,
  val payloadJson: String,
)

/**
 * Outcome of one config evaluation. [findings] are the rules that tripped; [cleanKinds] are the rules
 * that evaluated with real data and were fine (so the registry auto-clears them, fault-code model). A
 * rule whose inputs were absent appears in neither list — it is skipped, leaving any stored warning
 * untouched.
 */
data class ConfigSafetyReport(
  val findings: List<ConfigSafetyFinding>,
  val cleanKinds: List<String>,
)

/**
 * Config-scoped Board Warning detector: pure rules over the decoded Refloat safety config plus the
 * board's configured battery series count. Pure evaluation logic per the pure-native-logic ADR; the
 * background config read, series-count lookup, and registry reporting stay in the session controller.
 *
 * Thresholds are native constants. The pushback voltage rules ([KIND_LV], [KIND_HV]) read `tiltback_lv`
 * / `tiltback_hv` in whichever units the firmware uses: Refloat on VESC 6.05+ stores a **per-cell**
 * value (compared directly against the per-cell bound), older firmware stores a **pack** value
 * (compared against `bound × series`, so it needs the series count). [usesPerCellVoltage] resolves the
 * mode from the firmware string; when it cannot ([perCell] null) — or when pack mode lacks a series
 * count — those two rules are skipped. A rule whose config field is missing from the schema is likewise
 * skipped. Every payload carries the offending parameter, its current value, and the safe bound so the
 * UI can explain the finding.
 *
 * @parity /modules/vesc-ble/ios/ConfigSafetyDetector.swift
 */
object ConfigSafetyDetector {
  const val KIND_FOOTPAD = "footpad-disabled"
  const val KIND_LV = "lv-pushback-low"
  const val KIND_HV = "hv-pushback-high"
  const val KIND_DUTY = "duty-pushback-high"
  const val KIND_MOVING_FAULT = "moving-fault-disabled"

  /** Minimum safe low-voltage pushback per cell (V). Pack-mode bound is `this × series`. */
  const val CELL_LV_MIN_V = 3.0

  /** Maximum safe high-voltage pushback per cell (V). Pack-mode bound is `this × series`. */
  const val CELL_HV_MAX_V = 4.3

  /** Maximum safe duty-cycle pushback threshold (fraction). VESC max duty is 0.95. */
  const val DUTY_MAX = 0.85

  /** First VESC firmware (major, minor) that stores `tiltback_lv`/`tiltback_hv` as per-cell values. */
  private const val PER_CELL_FW_MAJOR = 6
  private const val PER_CELL_FW_MINOR = 5

  private val fwVersionPattern = Regex("""(\d+)\.(\d+)""")

  /**
   * Whether the firmware stores the pushback voltages per-cell (VESC 6.05+) rather than as a pack
   * total. Returns null when the firmware string is absent or unparseable, so the caller skips the
   * voltage rules rather than guessing the units.
   */
  fun usesPerCellVoltage(fwVersion: String?): Boolean? {
    val match = fwVersion?.let { fwVersionPattern.find(it) } ?: return null
    val major = match.groupValues[1].toIntOrNull() ?: return null
    val minor = match.groupValues[2].toIntOrNull() ?: return null
    return major > PER_CELL_FW_MAJOR || (major == PER_CELL_FW_MAJOR && minor >= PER_CELL_FW_MINOR)
  }

  fun evaluate(values: ConfigSafetyValues, seriesCount: Int?, perCell: Boolean?): ConfigSafetyReport {
    val findings = mutableListOf<ConfigSafetyFinding>()
    val clean = mutableListOf<String>()

    // footpad-disabled (critical): both ADC switch voltages 0 disables the footpad switch entirely.
    val adc1 = values.faultAdc1
    val adc2 = values.faultAdc2
    if (adc1 != null && adc2 != null) {
      if (adc1 == 0.0 && adc2 == 0.0) {
        findings += finding(KIND_FOOTPAD, ConfigRuleSeverity.CRITICAL, "fault_adc1/fault_adc2", 0.0, 0.0)
      } else {
        clean += KIND_FOOTPAD
      }
    }

    // lv-pushback-low (critical): LV pushback below the safe minimum, in the firmware's voltage units.
    val lv = values.tiltbackLv
    val lvBound = voltageBound(CELL_LV_MIN_V, perCell, seriesCount)
    if (lv != null && lvBound != null) {
      if (lv < lvBound) {
        findings += finding(KIND_LV, ConfigRuleSeverity.CRITICAL, "tiltback_lv", lv, lvBound)
      } else {
        clean += KIND_LV
      }
    }

    // hv-pushback-high (warn): HV pushback above the safe maximum, in the firmware's voltage units.
    val hv = values.tiltbackHv
    val hvBound = voltageBound(CELL_HV_MAX_V, perCell, seriesCount)
    if (hv != null && hvBound != null) {
      if (hv > hvBound) {
        findings += finding(KIND_HV, ConfigRuleSeverity.WARN, "tiltback_hv", hv, hvBound)
      } else {
        clean += KIND_HV
      }
    }

    // duty-pushback-high (warn): duty pushback threshold set dangerously close to the duty limit.
    val duty = values.tiltbackDuty
    if (duty != null) {
      if (duty > DUTY_MAX) {
        findings += finding(KIND_DUTY, ConfigRuleSeverity.WARN, "tiltback_duty", duty, DUTY_MAX)
      } else {
        clean += KIND_DUTY
      }
    }

    // moving-fault-disabled (warn): moving faults disabled weakens fault protection while riding.
    val movingFault = values.movingFaultDisabled
    if (movingFault != null) {
      if (movingFault) {
        findings += finding(KIND_MOVING_FAULT, ConfigRuleSeverity.WARN, "fault_moving_fault_disabled", 1.0, 0.0)
      } else {
        clean += KIND_MOVING_FAULT
      }
    }

    return ConfigSafetyReport(findings, clean)
  }

  /**
   * The safe voltage bound in the firmware's units: the per-cell constant directly (per-cell firmware),
   * or `× series` (pack firmware). Null when the mode is unknown, or pack mode has no series count — the
   * caller then skips the rule.
   */
  private fun voltageBound(perCellBound: Double, perCell: Boolean?, seriesCount: Int?): Double? = when (perCell) {
    true -> perCellBound
    false -> seriesCount?.let { perCellBound * it }
    null -> null
  }

  private fun finding(kind: String, severity: ConfigRuleSeverity, param: String, value: Double, bound: Double) =
    ConfigSafetyFinding(kind, severity, payloadJson(param, value, bound))

  private fun payloadJson(param: String, value: Double, bound: Double): String {
    val v = String.format(Locale.US, "%.4f", value)
    val b = String.format(Locale.US, "%.4f", bound)
    return "{\"param\":\"$param\",\"value\":$v,\"bound\":$b}"
  }
}
