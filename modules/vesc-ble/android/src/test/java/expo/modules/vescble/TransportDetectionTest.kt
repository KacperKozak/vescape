package expo.modules.vescble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TransportDetectionTest {

  private fun probe(transport: BoardTransport, confirmed: Boolean, hasBms: Boolean = false) =
    TransportDetection.Probe(transport, confirmed, hasBms)

  // --- candidatesToProbe: always probe Direct + every responder ---

  @Test
  fun `probes direct even with no CAN responders`() {
    assertEquals(
      listOf(BoardTransport.Direct),
      TransportDetection.candidatesToProbe(emptyList()),
    )
  }

  @Test
  fun `probes direct first then every responder ascending`() {
    assertEquals(
      listOf(BoardTransport.Direct, BoardTransport.Can(12), BoardTransport.Can(43)),
      TransportDetection.candidatesToProbe(listOf(43, 12)),
    )
  }

  @Test
  fun `dedupes repeated responder ids`() {
    assertEquals(
      listOf(BoardTransport.Direct, BoardTransport.Can(7)),
      TransportDetection.candidatesToProbe(listOf(7, 7, 7)),
    )
  }

  // --- resolve: direct-only ---

  @Test
  fun `direct only confirmed resolves to direct`() {
    val result = TransportDetection.resolve(
      listOf(
        probe(BoardTransport.Direct, confirmed = true),
      ),
    )
    assertEquals(listOf(BoardTransport.Direct), result.candidates.map { it.transport })
    assertEquals(TransportDetection.Outcome.Resolved(BoardTransport.Direct), result.outcome)
  }

  // --- resolve: CAN-only ---

  @Test
  fun `can only confirmed resolves to that can id`() {
    val result = TransportDetection.resolve(
      listOf(
        probe(BoardTransport.Direct, confirmed = false),
        probe(BoardTransport.Can(43), confirmed = true),
      ),
    )
    assertEquals(listOf(BoardTransport.Can(43)), result.candidates.map { it.transport })
    assertEquals(TransportDetection.Outcome.Resolved(BoardTransport.Can(43)), result.outcome)
  }

  // --- resolve: multi-node (multiple valid CAN ids) ---

  @Test
  fun `multiple valid can ids need pick in probe order`() {
    val result = TransportDetection.resolve(
      listOf(
        probe(BoardTransport.Direct, confirmed = false),
        probe(BoardTransport.Can(12), confirmed = true),
        probe(BoardTransport.Can(43), confirmed = true),
      ),
    )
    assertEquals(
      listOf(BoardTransport.Can(12), BoardTransport.Can(43)),
      result.candidates.map { it.transport },
    )
    assertEquals(
      TransportDetection.Outcome.NeedsPick(
        listOf(BoardTransport.Can(12), BoardTransport.Can(43)),
      ),
      result.outcome,
    )
  }

  // --- resolve: both direct and CAN valid ---

  @Test
  fun `both direct and can valid need pick with direct pre-selected first`() {
    val result = TransportDetection.resolve(
      listOf(
        probe(BoardTransport.Direct, confirmed = true),
        probe(BoardTransport.Can(43), confirmed = true),
      ),
    )
    assertEquals(
      listOf(BoardTransport.Direct, BoardTransport.Can(43)),
      result.candidates.map { it.transport },
    )
    val outcome = result.outcome
    assertTrue(outcome is TransportDetection.Outcome.NeedsPick)
    assertEquals(
      BoardTransport.Direct,
      (outcome as TransportDetection.Outcome.NeedsPick).candidates.first(),
    )
  }

  // --- resolve: no working transport ---

  @Test
  fun `no confirmed transport yields none outcome`() {
    val result = TransportDetection.resolve(
      listOf(
        probe(BoardTransport.Direct, confirmed = false),
        probe(BoardTransport.Can(43), confirmed = false),
      ),
    )
    assertTrue(result.candidates.isEmpty())
    assertEquals(TransportDetection.Outcome.None, result.outcome)
  }

  @Test
  fun `empty probe set yields none outcome`() {
    val result = TransportDetection.resolve(emptyList())
    assertTrue(result.candidates.isEmpty())
    assertEquals(TransportDetection.Outcome.None, result.outcome)
  }

  // --- resolve: smart-BMS capability carried onto the candidate ---

  @Test
  fun `bms presence is carried onto the confirmed candidate`() {
    val result = TransportDetection.resolve(
      listOf(
        probe(BoardTransport.Direct, confirmed = true, hasBms = true),
      ),
    )
    assertEquals(
      listOf(TransportDetection.Candidate(BoardTransport.Direct, hasBms = true)),
      result.candidates,
    )
  }

  @Test
  fun `bms capability is tracked per candidate on multi-node bus`() {
    val result = TransportDetection.resolve(
      listOf(
        probe(BoardTransport.Direct, confirmed = true, hasBms = false),
        probe(BoardTransport.Can(43), confirmed = true, hasBms = true),
      ),
    )
    assertEquals(
      listOf(
        TransportDetection.Candidate(BoardTransport.Direct, hasBms = false),
        TransportDetection.Candidate(BoardTransport.Can(43), hasBms = true),
      ),
      result.candidates,
    )
  }

  @Test
  fun `bms on an unconfirmed transport is dropped with it`() {
    val result = TransportDetection.resolve(
      listOf(
        probe(BoardTransport.Direct, confirmed = false, hasBms = true),
        probe(BoardTransport.Can(7), confirmed = true, hasBms = false),
      ),
    )
    assertEquals(
      listOf(TransportDetection.Candidate(BoardTransport.Can(7), hasBms = false)),
      result.candidates,
    )
  }
}
