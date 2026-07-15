package expo.modules.vescble

import java.util.Locale
import kotlin.math.abs

/** Two-tier cell-spread finding severity. Mapped to [BoardWarningSeverity] by the session controller. */
enum class CellSpreadSeverity { WARN, CRITICAL }

/** One cell-spread finding to report through the Board Warning registry. */
data class CellSpreadFinding(val severity: CellSpreadSeverity, val payloadJson: String)

/**
 * Telemetry-scoped Board Warning detector for smart-BMS cell-voltage spread. Pure evaluation logic
 * per the pure-native-logic ADR: a stateful tracker fed each ~4Hz BMS frame plus its charge-port
 * voltage; session wiring (registry reporting, session lifecycle) stays in the session controller.
 *
 * Spread is `max − min` across valid cell-group voltages (finite and > 0, same filter as
 * `summarizeBms`). A finding fires only once the spread has stayed over the warn threshold for a
 * sustained window ([sustainMs]) — a single-frame spike never fires. Sustain is tracked as
 * time-over-threshold, not consecutive frames, because the BMS frame rate is not guaranteed stable.
 * Severity tiers on the episode's peak spread (warn at [warnThresholdV], critical at
 * [criticalThresholdV]); charging is context, not a separate warning kind, so charging sessions are
 * evaluated the same way and the payload records whether the finding occurred while charging and
 * whether balancing was active. The payload also carries the peak spread observed and the worst
 * cell-group index (largest absolute deviation from the pack average) at that peak; an already-fired
 * warning keeps updating as the peak climbs, so the registry's upsert path preserves `firstDetectedAt`.
 *
 * @parity /modules/vesc-ble/ios/telemetry/CellSpreadDetector.swift
 */
class CellSpreadDetector(
  private val warnThresholdV: Double = WARN_THRESHOLD_V,
  private val criticalThresholdV: Double = CRITICAL_THRESHOLD_V,
  private val sustainMs: Long = SUSTAIN_MS,
) {
  private var sawData = false
  private var fired = false
  private var overSinceMs: Long? = null
  private var episodePeakV = 0.0
  private var episodeWorstGroup = -1
  private var reportedPeakV = 0.0
  private var reportedSeverity: CellSpreadSeverity? = null

  /** Reset all tracking for a fresh Board Session. */
  fun reset() {
    sawData = false
    fired = false
    overSinceMs = null
    episodePeakV = 0.0
    episodeWorstGroup = -1
    reportedPeakV = 0.0
    reportedSeverity = null
  }

  /**
   * Feed one smart-BMS frame. Returns a finding to report, or null when nothing should be reported
   * this frame (no usable cells, spread under threshold, sustain window not yet met, or the already
   * fired warning has not meaningfully changed).
   */
  fun onFrame(
    cellVoltages: List<Double>,
    balancing: List<Boolean>,
    vCharge: Double,
    atMs: Long,
  ): CellSpreadFinding? {
    var min = Double.MAX_VALUE
    var max = -Double.MAX_VALUE
    var sum = 0.0
    var count = 0
    for (v in cellVoltages) {
      if (!v.isFinite() || v <= 0.0) continue
      if (v < min) min = v
      if (v > max) max = v
      sum += v
      count += 1
    }
    if (count == 0) return null
    sawData = true
    val spread = max - min

    if (spread < warnThresholdV) {
      // Under threshold: any in-flight sustain episode ends. A durable warning already stored stays
      // put — it clears only via a whole-session clean evaluation at session end, not on a dip.
      overSinceMs = null
      episodePeakV = 0.0
      episodeWorstGroup = -1
      return null
    }

    if (overSinceMs == null) {
      overSinceMs = atMs
      episodePeakV = 0.0
      episodeWorstGroup = -1
    }
    if (spread > episodePeakV) {
      episodePeakV = spread
      episodeWorstGroup = worstGroupIndex(cellVoltages, sum / count)
    }
    if (atMs - (overSinceMs ?: atMs) < sustainMs) return null

    val severity =
      if (episodePeakV >= criticalThresholdV) CellSpreadSeverity.CRITICAL else CellSpreadSeverity.WARN
    val peakRose = episodePeakV - reportedPeakV >= REPORT_PEAK_EPSILON_V
    if (fired && severity == reportedSeverity && !peakRose) return null

    fired = true
    reportedPeakV = episodePeakV
    reportedSeverity = severity
    val charging = vCharge.isFinite() && vCharge > CHARGE_DETECT_MIN_V
    val balancingActive = balancing.any { it }
    return CellSpreadFinding(
      severity,
      payloadJson(episodePeakV, episodeWorstGroup, charging, balancingActive),
    )
  }

  /**
   * At session end: report a clean evaluation only when BMS data flowed and no sustained spread
   * fired this session. Transient spikes that never sustain do not block the clean clear; a session
   * with no BMS data returns false so a previously stored warning is left untouched.
   */
  fun sessionEndClean(): Boolean = sawData && !fired

  /** Cell group furthest (absolute) from the pack average — the group breaking away from the pack. */
  private fun worstGroupIndex(cellVoltages: List<Double>, average: Double): Int {
    var worst = -1
    var worstDeviation = -1.0
    cellVoltages.forEachIndexed { index, v ->
      if (!v.isFinite() || v <= 0.0) return@forEachIndexed
      val deviation = abs(v - average)
      if (deviation > worstDeviation) {
        worstDeviation = deviation
        worst = index
      }
    }
    return worst
  }

  private fun payloadJson(peakV: Double, worstGroup: Int, charging: Boolean, balancing: Boolean): String {
    val peak = String.format(Locale.US, "%.4f", peakV)
    return "{\"peakSpread\":$peak,\"worstGroup\":$worstGroup,\"charging\":$charging,\"balancing\":$balancing}"
  }

  companion object {
    /** Registry warning kind this detector owns. */
    const val KIND = "cell-spread"

    /** Spread ≥ this (V), sustained, fires a warn-level cell-spread warning. Field-tuned constant. */
    const val WARN_THRESHOLD_V = 0.10

    /** Peak spread ≥ this (V) during a sustained episode escalates the finding to critical. */
    const val CRITICAL_THRESHOLD_V = 0.25

    /** Spread must stay over threshold at least this long before firing — filters transient spikes. */
    const val SUSTAIN_MS = 3_000L

    /** Re-report an already-fired warning once the episode peak climbs by at least this (V). */
    const val REPORT_PEAK_EPSILON_V = 0.005

    /** Charger present when vCharge is finite and above this (V). Mirrors JS `isBmsCharging`. */
    const val CHARGE_DETECT_MIN_V = 10.0
  }
}
