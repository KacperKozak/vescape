package expo.modules.vescble

/**
 * Telemetry-scoped Board Warning detector for a smart-BMS cell count that disagrees with the board's
 * configured battery series count. Pure evaluation logic per the pure-native-logic ADR: a stateful
 * tracker fed each ~4Hz BMS frame's cell count plus the configured series count; session wiring
 * (registry reporting, lifecycle) stays in the session controller.
 *
 * The BMS cell count must be stable — the same count across [stableFrames] consecutive frames —
 * before it is compared. The BMS series payload's `cellNum` can wobble on a reconnect or a firmware
 * quirk (`BmsSeriesRing` resets its columnar layout on any width change), so a single odd frame must
 * never fire; the run resets whenever the count changes. Once stable, the count is compared against
 * the configured series count that the SoC estimator and the per-cell pushback bounds also read: a
 * difference fires one warn-severity warning carrying both counts, matching counts fire nothing and
 * leave a session-end clean evaluation to auto-clear any stored warning.
 *
 * A missing configured series count is not a clean evaluation — with nothing to compare against the
 * detector reports nothing and leaves any stored warning untouched (guarded via [sessionEndClean]).
 * A session with no BMS data likewise reaches no stable count and reports nothing.
 *
 * @parity /modules/vesc-ble/ios/telemetry/BatteryConfigMismatchDetector.swift
 */
class BatteryConfigMismatchDetector(
  private val stableFrames: Int = STABLE_FRAMES,
) {
  private var runValue = 0
  private var runLen = 0
  private var evaluated = false
  private var fired = false
  private var reportedCount = -1

  /** Reset all tracking for a fresh Board Session. */
  fun reset() {
    runValue = 0
    runLen = 0
    evaluated = false
    fired = false
    reportedCount = -1
  }

  /**
   * Feed one smart-BMS frame's cell count and the currently configured series count. Returns the
   * warning payload to report, or null when nothing should be reported this frame (no cells, the
   * count is not yet stable, no configured series to compare against, the counts match, or the
   * mismatch was already reported).
   */
  fun onFrame(bmsCellCount: Int, configuredSeries: Int?): String? {
    if (bmsCellCount <= 0) return null
    if (bmsCellCount == runValue) runLen += 1 else { runValue = bmsCellCount; runLen = 1 }
    // A single odd frame (or the first frame of a new stable count) must not fire.
    if (runLen < stableFrames) return null
    // No configured series to compare against is not a clean evaluation — report nothing and leave
    // any stored warning untouched (evaluated stays false so sessionEndClean does not clear it).
    if (configuredSeries == null || configuredSeries <= 0) return null
    evaluated = true
    if (bmsCellCount == configuredSeries) return null
    if (fired && reportedCount == bmsCellCount) return null
    fired = true
    reportedCount = bmsCellCount
    return payloadJson(bmsCellCount, configuredSeries)
  }

  /**
   * At session end: report a clean evaluation only when a stable BMS count was compared against a
   * configured series count and no mismatch fired. No BMS data or no configured series leaves
   * [evaluated] false, so a previously stored warning is left untouched.
   */
  fun sessionEndClean(): Boolean = evaluated && !fired

  private fun payloadJson(bmsCellCount: Int, configuredSeries: Int): String =
    "{\"bmsCellCount\":$bmsCellCount,\"configuredSeries\":$configuredSeries}"

  companion object {
    /** Registry warning kind this detector owns. */
    const val KIND = "battery-config-mismatch"

    /** BMS cell count must repeat across this many consecutive frames before it is compared. */
    const val STABLE_FRAMES = 3
  }
}
