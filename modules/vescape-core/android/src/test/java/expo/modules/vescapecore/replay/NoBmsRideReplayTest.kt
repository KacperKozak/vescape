package expo.modules.vescapecore.replay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * No-BMS ride guard: a real captured ride from a board with no smart BMS (`replay-thor301.jsonl`)
 * must decode to zero BMS frames and leave both telemetry-scoped detectors silent — the app must
 * never invent a warning (or crash) when a board reports no smart-BMS telemetry. Runs against real
 * inbound traffic, so it also proves the decoder does not misparse motor packets as BMS frames.
 *
 * @parity /modules/vescape-core/ios/replay/NoBmsRideReplayTests.swift
 */
class NoBmsRideReplayTest {
  private val jsonl =
    javaClass.classLoader!!.getResourceAsStream("fixtures/replay-thor301.jsonl")!!
      .bufferedReader().readText()

  @Test
  fun realRideHasInboundTrafficButNoBmsFrames() {
    // Real recording carries inbound BLE traffic...
    assertTrue("expected recorded rx chunks", ReplayChunkDecoder.rxChunks(jsonl).isNotEmpty())
    // ...none of which decodes to smart-BMS telemetry.
    assertTrue("no-BMS ride must yield zero BMS frames", ReplayChunkDecoder.bmsFrames(jsonl).isEmpty())
  }

  @Test
  fun noBmsRideKeepsDetectorsSilent() {
    // A configured series count is present, yet with no BMS frames there is nothing to evaluate:
    // both detectors stay silent (no false cell-spread, no false config-mismatch)...
    val result = WarningReplayHarness.run(jsonl, configuredSeries = 16)
    assertEquals(0, result.frameCount)
    assertEquals(emptyList<Any>(), result.cellSpreadFindings)
    assertEquals(emptyList<String>(), result.mismatchFindings)
    // ...and, having seen no data, they make no "healthy" claim, so a previously stored warning is
    // left untouched (sessionEndClean stays false — it clears warnings only after observing data).
    assertTrue("no BMS data must not assert a healthy session", !result.cellSpreadSessionEndClean)
    assertTrue("no BMS data must not assert a healthy session", !result.mismatchSessionEndClean)
  }
}
