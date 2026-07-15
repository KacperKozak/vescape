import Foundation

/// Two-tier cell-spread finding severity. Mapped to `BoardWarningRegistry.Severity` by the session
/// controller — the detector stays decoupled from the registry so it is pure and unit-testable.
enum CellSpreadSeverity {
  case warn
  case critical
}

/// One cell-spread finding to report through the Board Warning registry.
struct CellSpreadFinding {
  let severity: CellSpreadSeverity
  let payloadJson: String
}

/// Telemetry-scoped Board Warning detector for smart-BMS cell-voltage spread. Pure evaluation logic
/// per the pure-native-logic ADR: a stateful tracker fed each ~4Hz BMS frame plus its charge-port
/// voltage; session wiring (registry reporting, session lifecycle) stays in the session controller.
///
/// Spread is `max − min` across valid cell-group voltages (finite and > 0, same filter as
/// `summarizeBms`). A finding fires only once the spread has stayed over the warn threshold for a
/// sustained window (`sustainMs`) — a single-frame spike never fires. Sustain is tracked as
/// time-over-threshold, not consecutive frames, because the BMS frame rate is not guaranteed stable.
/// Severity tiers on the episode's peak spread (warn at `warnThresholdV`, critical at
/// `criticalThresholdV`); charging is context, not a separate warning kind, so charging sessions are
/// evaluated the same way and the payload records whether the finding occurred while charging and
/// whether balancing was active. The payload also carries the peak spread observed and the worst
/// cell-group index (largest absolute deviation from the pack average) at that peak; an already-fired
/// warning keeps updating as the peak climbs, so the registry's upsert path preserves `firstDetectedAt`.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/CellSpreadDetector.kt
final class CellSpreadDetector {
  /// Registry warning kind this detector owns.
  static let kind = "cell-spread"

  /// Spread ≥ this (V), sustained, fires a warn-level cell-spread warning. Field-tuned constant.
  static let warnThresholdV = 0.10
  /// Peak spread ≥ this (V) during a sustained episode escalates the finding to critical.
  static let criticalThresholdV = 0.25
  /// Spread must stay over threshold at least this long before firing — filters transient spikes.
  static let sustainMs: Int64 = 3_000
  /// Re-report an already-fired warning once the episode peak climbs by at least this (V).
  static let reportPeakEpsilonV = 0.005
  /// Charger present when vCharge is finite and above this (V). Mirrors JS `isBmsCharging`.
  static let chargeDetectMinV = 10.0

  private let warnThresholdV: Double
  private let criticalThresholdV: Double
  private let sustainMs: Int64

  private var sawData = false
  private var fired = false
  private var overSinceMs: Int64?
  private var episodePeakV = 0.0
  private var episodeWorstGroup = -1
  private var reportedPeakV = 0.0
  private var reportedSeverity: CellSpreadSeverity?

  init(
    warnThresholdV: Double = CellSpreadDetector.warnThresholdV,
    criticalThresholdV: Double = CellSpreadDetector.criticalThresholdV,
    sustainMs: Int64 = CellSpreadDetector.sustainMs
  ) {
    self.warnThresholdV = warnThresholdV
    self.criticalThresholdV = criticalThresholdV
    self.sustainMs = sustainMs
  }

  /// Reset all tracking for a fresh Board Session.
  func reset() {
    sawData = false
    fired = false
    overSinceMs = nil
    episodePeakV = 0.0
    episodeWorstGroup = -1
    reportedPeakV = 0.0
    reportedSeverity = nil
  }

  /// Feed one smart-BMS frame. Returns a finding to report, or nil when nothing should be reported
  /// this frame (no usable cells, spread under threshold, sustain window not yet met, or the already
  /// fired warning has not meaningfully changed).
  func onFrame(
    cellVoltages: [Double],
    balancing: [Bool],
    vCharge: Double,
    atMs: Int64
  ) -> CellSpreadFinding? {
    var minV = Double.greatestFiniteMagnitude
    var maxV = -Double.greatestFiniteMagnitude
    var sum = 0.0
    var count = 0
    for v in cellVoltages {
      if !v.isFinite || v <= 0.0 { continue }
      if v < minV { minV = v }
      if v > maxV { maxV = v }
      sum += v
      count += 1
    }
    if count == 0 { return nil }
    sawData = true
    let spread = maxV - minV

    if spread < warnThresholdV {
      // Under threshold: any in-flight sustain episode ends. A durable warning already stored stays
      // put — it clears only via a whole-session clean evaluation at session end, not on a dip.
      overSinceMs = nil
      episodePeakV = 0.0
      episodeWorstGroup = -1
      return nil
    }

    if overSinceMs == nil {
      overSinceMs = atMs
      episodePeakV = 0.0
      episodeWorstGroup = -1
    }
    if spread > episodePeakV {
      episodePeakV = spread
      episodeWorstGroup = worstGroupIndex(cellVoltages, average: sum / Double(count))
    }
    if atMs - (overSinceMs ?? atMs) < sustainMs { return nil }

    let severity: CellSpreadSeverity = episodePeakV >= criticalThresholdV ? .critical : .warn
    let peakRose = episodePeakV - reportedPeakV >= CellSpreadDetector.reportPeakEpsilonV
    if fired, severity == reportedSeverity, !peakRose { return nil }

    fired = true
    reportedPeakV = episodePeakV
    reportedSeverity = severity
    let charging = vCharge.isFinite && vCharge > CellSpreadDetector.chargeDetectMinV
    let balancingActive = balancing.contains(true)
    return CellSpreadFinding(
      severity: severity,
      payloadJson: payloadJson(
        peakV: episodePeakV,
        worstGroup: episodeWorstGroup,
        charging: charging,
        balancing: balancingActive
      )
    )
  }

  /// At session end: report a clean evaluation only when BMS data flowed and no sustained spread
  /// fired this session. Transient spikes that never sustain do not block the clean clear; a session
  /// with no BMS data returns false so a previously stored warning is left untouched.
  func sessionEndClean() -> Bool { sawData && !fired }

  /// Cell group furthest (absolute) from the pack average — the group breaking away from the pack.
  private func worstGroupIndex(_ cellVoltages: [Double], average: Double) -> Int {
    var worst = -1
    var worstDeviation = -1.0
    for (index, v) in cellVoltages.enumerated() {
      if !v.isFinite || v <= 0.0 { continue }
      let deviation = abs(v - average)
      if deviation > worstDeviation {
        worstDeviation = deviation
        worst = index
      }
    }
    return worst
  }

  private func payloadJson(peakV: Double, worstGroup: Int, charging: Bool, balancing: Bool) -> String {
    let peak = String(format: "%.4f", peakV)
    return "{\"peakSpread\":\(peak),\"worstGroup\":\(worstGroup),\"charging\":\(charging),\"balancing\":\(balancing)}"
  }
}
