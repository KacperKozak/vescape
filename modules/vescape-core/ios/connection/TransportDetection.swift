import Foundation

/// Pure resolution brain for Board Transport detection.
///
/// Given probe observations — which transports were probed and which produced a valid decoded
/// Refloat Telemetry Sample — it emits the confirmed candidate set and an outcome. No BLE, no
/// timers: `BoardTransportDetector` wraps this but stays out of the testable core.
///
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/connection/TransportDetection.kt
internal enum TransportDetection {
  /// One probed transport: whether it yielded ≥1 valid Telemetry Sample (`confirmed`), whether a
  /// smart-BMS answered on it (`hasBms`), and best-effort firmware identity read from that same
  /// transport.
  struct Probe: Equatable {
    let transport: BoardTransport
    let confirmed: Bool
    let hasBms: Bool
    let vescFirmwareVersion: String?
    let refloatVersion: String?
    let refloatBaseVersion: String?

    init(
      transport: BoardTransport,
      confirmed: Bool,
      hasBms: Bool = false,
      vescFirmwareVersion: String? = nil,
      refloatVersion: String? = nil,
      refloatBaseVersion: String? = nil
    ) {
      self.transport = transport
      self.confirmed = confirmed
      self.hasBms = hasBms
      self.vescFirmwareVersion = vescFirmwareVersion
      self.refloatVersion = refloatVersion
      self.refloatBaseVersion = refloatBaseVersion
    }
  }

  /// A confirmed transport plus the capabilities discovered while probing it.
  struct Candidate: Equatable {
    let transport: BoardTransport
    let hasBms: Bool
    let vescFirmwareVersion: String?
    let refloatVersion: String?
    let refloatBaseVersion: String?

    init(
      transport: BoardTransport,
      hasBms: Bool,
      vescFirmwareVersion: String? = nil,
      refloatVersion: String? = nil,
      refloatBaseVersion: String? = nil
    ) {
      self.transport = transport
      self.hasBms = hasBms
      self.vescFirmwareVersion = vescFirmwareVersion
      self.refloatVersion = refloatVersion
      self.refloatBaseVersion = refloatBaseVersion
    }
  }

  enum Outcome: Equatable {
    /// Exactly one transport confirmed — the Board can connect with it directly.
    case resolved(BoardTransport)
    /// More than one transport confirmed (multi-controller bus) — the rider picks.
    case needsPick([BoardTransport])
    /// No transport produced telemetry — retryable failure, store nothing.
    case none
  }

  struct Result: Equatable {
    let candidates: [Candidate]
    let outcome: Outcome

    /// Single resolved Board Transport for the bridge contract. `nil` means no confirmed
    /// transport or multiple confirmed transports requiring rider choice.
    var resolvedTransport: BoardTransport? {
      switch outcome {
      case .resolved(let transport): return transport
      case .needsPick, .none: return nil
      }
    }
  }

  /// Transports to probe given the CAN ids that answered the CAN ping.
  ///
  /// Direct is always probed; every responder is probed — not just the first id. Deduped and
  /// deterministic: Direct first, then CAN ids ascending.
  static func candidatesToProbe(_ canPingResponders: [Int]) -> [BoardTransport] {
    var transports: [BoardTransport] = [.direct]
    for canId in Set(canPingResponders).sorted() { transports.append(.can(canId)) }
    return transports
  }

  /// Resolve probe observations into the confirmed candidate set + outcome.
  ///
  /// A transport is a candidate only when it produced at least one valid sample. Candidate order
  /// follows probe order, so the first confirmed candidate is the natural pre-selection for the
  /// needs-pick case.
  static func resolve(_ probes: [Probe]) -> Result {
    let candidates = probes
      .filter { $0.confirmed }
      .map {
        Candidate(
          transport: $0.transport,
          hasBms: $0.hasBms,
          vescFirmwareVersion: $0.vescFirmwareVersion,
          refloatVersion: $0.refloatVersion,
          refloatBaseVersion: $0.refloatBaseVersion
        )
      }
    let transports = candidates.map { $0.transport }
    let outcome: Outcome
    switch transports.count {
    case 0: outcome = .none
    case 1: outcome = .resolved(transports[0])
    default: outcome = .needsPick(transports)
    }
    return Result(candidates: candidates, outcome: outcome)
  }
}
