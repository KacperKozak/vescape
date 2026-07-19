package expo.modules.vescapecore.replay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Clean-run false-positive guard: the committed clean Debug Recording fixture replayed through the
 * real byte→decode path must produce zero findings on every frame and a clean session-end result
 * from both telemetry-scoped detectors. A detector change that fires on this fixture is a CI failure
 * to investigate, not a snapshot to update (ADR 0024). Also pins the replay decoder contract: frame
 * count and pacing survive the reassembler, tx/meta/location/malformed lines are skipped.
 *
 * @parity /modules/vescape-core/ios/replay/WarningReplayHarnessTests.swift
 */
class WarningReplayCleanRunTest {
  private val jsonl =
    javaClass.classLoader!!.getResourceAsStream("fixtures/replay-clean.jsonl")!!
      .bufferedReader().readText()

  // The fixture's known shape; matching the configured series makes the mismatch run comparable.
  private val fixtureSeries = 16

  @Test
  fun decoderYieldsOrderedBmsFramesFromRxChunksOnly() {
    val frames = ReplayChunkDecoder.bmsFrames(jsonl)
    // No vacuous green: a fixture that decodes to nothing must fail loudly.
    assertTrue("fixture yielded zero BMS frames", frames.isNotEmpty())
    assertEquals(fixtureSeries, frames.first().cellVoltages.size)
    // Every recorded frame survives the reassembler at the recorded 4 Hz pacing — a decoder that
    // silently drops frames must fail here, not stay vacuously green on the clean run.
    assertEquals(480, frames.size)
    assertEquals(250L, frames.first().capturedAt)
    assertEquals(120_000L, frames.last().capturedAt)
    assertTrue(frames.zipWithNext().all { (a, b) -> b.capturedAt - a.capturedAt == 250L })
  }

  @Test
  fun cleanFixtureProducesZeroFindingsAndCleanSessionEnd() {
    val result = WarningReplayHarness.run(jsonl, configuredSeries = fixtureSeries)
    assertTrue("fixture yielded zero BMS frames", result.frameCount > 0)
    assertEquals(emptyList<Any>(), result.cellSpreadFindings)
    assertEquals(emptyList<String>(), result.mismatchFindings)
    assertTrue(result.cellSpreadSessionEndClean)
    assertTrue(result.mismatchSessionEndClean)
  }
}
