package expo.modules.vescble

/**
 * Pure resolution brain for Board Transport detection.
 *
 * Given probe observations — which transports were probed and which produced a
 * valid decoded Refloat Telemetry Sample — it emits the confirmed candidate set
 * and an outcome. No BLE, no timers: BLE orchestration wraps this but stays out
 * of the testable core. This is the relocated, generalized form of the inline
 * discovery predicates that used to live in [ConnectionLogic].
 */
internal object TransportDetection {
  /**
   * One probed transport: whether it yielded ≥1 valid Telemetry Sample
   * ([confirmed]) and whether a smart-BMS answered on it ([hasBms]).
   */
  data class Probe(
    val transport: BoardTransport,
    val confirmed: Boolean,
    val hasBms: Boolean = false,
  )

  /** A confirmed transport plus the capabilities discovered while probing it. */
  data class Candidate(val transport: BoardTransport, val hasBms: Boolean)

  sealed interface Outcome {
    /** Exactly one transport confirmed — the Board can connect with it directly. */
    data class Resolved(val transport: BoardTransport) : Outcome

    /** More than one transport confirmed (multi-controller bus) — the rider picks. */
    data class NeedsPick(val candidates: List<BoardTransport>) : Outcome

    /** No transport produced telemetry — retryable failure, store nothing. */
    object None : Outcome
  }

  data class Result(val candidates: List<Candidate>, val outcome: Outcome)

  /**
   * Transports to probe given the CAN ids that answered the CAN ping.
   *
   * Direct is always probed; every responder is probed — not just the first id,
   * which is the bug the inline discovery path had. Deduped and deterministic:
   * Direct first, then CAN ids ascending.
   */
  fun candidatesToProbe(canPingResponders: List<Int>): List<BoardTransport> =
    buildList {
      add(BoardTransport.Direct)
      canPingResponders.distinct().sorted().forEach { add(BoardTransport.Can(it)) }
    }

  /**
   * Resolve probe observations into the confirmed candidate set + outcome.
   *
   * A transport is a candidate only when it produced at least one valid sample.
   * Candidate order follows probe order, so the first confirmed candidate is the
   * natural pre-selection for the needs-pick case.
   */
  fun resolve(probes: List<Probe>): Result {
    val candidates = probes.filter { it.confirmed }.map { Candidate(it.transport, it.hasBms) }
    val transports = candidates.map { it.transport }
    val outcome = when (transports.size) {
      0 -> Outcome.None
      1 -> Outcome.Resolved(transports.single())
      else -> Outcome.NeedsPick(transports)
    }
    return Result(candidates, outcome)
  }
}
