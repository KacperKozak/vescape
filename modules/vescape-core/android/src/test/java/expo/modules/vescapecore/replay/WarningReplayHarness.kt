package expo.modules.vescapecore.replay

import expo.modules.vescapecore.protocol.BmsTelemetry
import expo.modules.vescapecore.warnings.BatteryConfigMismatchDetector
import expo.modules.vescapecore.warnings.CellSpreadDetector
import expo.modules.vescapecore.warnings.CellSpreadFinding

/**
 * Board Warning replay harness (ADR 0024): drives a `.jsonl` Debug Recording through the real
 * byte→reassemble→decode path and feeds every decoded BMS frame into the telemetry-scoped detectors,
 * using recorded timestamps as the clock so sustain windows run instantly, no wall-clock waits.
 * Fault scenarios layer a decode-level [transform] onto the clean frames — never byte mutation.
 * The configured series count is a scenario parameter because recordings do not carry it usably.
 *
 * @parity /modules/vescape-core/ios/replay/WarningReplayHarnessTests.swift
 */
internal object WarningReplayHarness {
  data class Result(
    val frameCount: Int,
    val cellSpreadFindings: List<CellSpreadFinding>,
    val mismatchFindings: List<String>,
    val cellSpreadSessionEndClean: Boolean,
    val mismatchSessionEndClean: Boolean,
  )

  fun run(
    jsonl: String,
    configuredSeries: Int?,
    transform: (BmsTelemetry, Long) -> BmsTelemetry = { bms, _ -> bms },
  ): Result {
    val cellSpread = CellSpreadDetector()
    val mismatch = BatteryConfigMismatchDetector()
    val cellSpreadFindings = mutableListOf<CellSpreadFinding>()
    val mismatchFindings = mutableListOf<String>()

    val frames = ReplayChunkDecoder.bmsFrames(jsonl)
    for (frame in frames) {
      val atMs = frame.capturedAt
      val bms = transform(frame, atMs)
      cellSpread.onFrame(bms.cellVoltages, bms.balancing, bms.vCharge, atMs)?.let(cellSpreadFindings::add)
      mismatch.onFrame(bms.cellVoltages.size, configuredSeries)?.let(mismatchFindings::add)
    }

    return Result(
      frameCount = frames.size,
      cellSpreadFindings = cellSpreadFindings,
      mismatchFindings = mismatchFindings,
      cellSpreadSessionEndClean = cellSpread.sessionEndClean(),
      mismatchSessionEndClean = mismatch.sessionEndClean(),
    )
  }
}
