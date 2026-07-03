import Foundation

// Re-probing a connected board tears down the live GATT and reconnects immediately; the OS
// releases the old connection asynchronously, so connecting too soon can fail. Settle before the
// first connect, then retry a bounded number of times with backoff on connect-phase drops.
private let PROBE_CONNECT_TIMEOUT_MS = 8_000
private let PROBE_FW_DELAY_MS = 300
private let PROBE_PING_DELAY_MS = 600
private let PROBE_GATT_RELEASE_DELAY_MS = 600
private let PROBE_BMS_DELAY_MS = 300
private let PROBE_CONNECT_SETTLE_MS = 500
private let PROBE_CONNECT_RETRY_BACKOFF_MS = 400
private let PROBE_CONNECT_MAX_ATTEMPTS = 3
private let PROBE_CAN_PING_TIMEOUT_MS = 3_500
private let PROBE_TRANSPORT_TIMEOUT_MS = 2_500

/// BLE orchestration that runs a single Board Probe and resolves it through the pure
/// `TransportDetection` brain. It owns its own `VescGattClient` (separate `CBCentralManager`),
/// kept apart from the live Board Session so probing stays out of the runtime hot path, and
/// surfaces live milestones through `onProgress`.
///
/// Flow: connect → ping CAN (collect every responder, not just the first) → probe Direct and each
/// responder by polling telemetry and confirming a transport only once it yields a valid decoded
/// Refloat Telemetry Sample → resolve. The central runs on the main queue, so every callback and
/// timer here is single-threaded on main.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/BoardTransportDetector.kt
/// @platform-diff iOS emits no Diagnostic Events (no telemetry store yet) and gets no BLE
/// disconnect status code from CoreBluetooth, so connect-phase retries key off attempt count
/// alone. Peers converge when the iOS diagnostics store lands.
internal final class BoardTransportDetector: VescGattListener {
  private enum Phase { case connecting, pinging, probing }

  private let bleId: String
  private let onProgress: ([String: Any?]) -> Void
  private let onComplete: (TransportDetection.Result) -> Void
  private let onError: (String, String) -> Void
  private let nowMs: () -> Int64

  private lazy var gatt = VescGattClient(listener: self)
  private let reassembler = VescPacketReassembler()

  private var responders = Set<Int>()
  private var probeQueue: [BoardTransport] = []
  private var observations: [TransportDetection.Probe] = []
  private var current: BoardTransport?
  private var currentConfirmed = false
  private var currentHasBms = false
  private var connectAttempts = 0
  private var phase: Phase = .connecting
  private var stepWork: DispatchWorkItem?
  private var finished = false
  private var startMs: Int64 = 0

  init(
    bleId: String,
    onProgress: @escaping ([String: Any?]) -> Void,
    onComplete: @escaping (TransportDetection.Result) -> Void,
    onError: @escaping (String, String) -> Void,
    nowMs: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }
  ) {
    self.bleId = bleId
    self.onProgress = onProgress
    self.onComplete = onComplete
    self.onError = onError
    self.nowMs = nowMs
  }

  private func elapsed() -> Int64 { nowMs() - startMs }

  /// Surface the coarse, monotonic probe phase to JS. Per-transport detail (which transport,
  /// telemetry/BMS replies) is intentionally not reported here — the UI reads resolved transports
  /// from the returned candidates, not from progress.
  private func emitProgress(_ step: String) {
    onProgress(["step": step, "elapsedMs": elapsed()])
  }

  func start() {
    startMs = nowMs()
    phase = .connecting
    attemptConnect(initial: true)
  }

  /// Open the probe's GATT connection after a settle delay. The first attempt waits for any
  /// just-released live connection to clear; retries back off after a transient connect-phase drop.
  private func attemptConnect(initial: Bool) {
    if finished { return }
    connectAttempts += 1
    emitProgress("connecting")
    let delay = initial ? PROBE_CONNECT_SETTLE_MS : PROBE_CONNECT_RETRY_BACKOFF_MS
    after(delay) { [weak self] in
      guard let self, !self.finished else { return }
      self.gatt.connect(peripheralId: self.bleId)
      self.armStep(PROBE_CONNECT_TIMEOUT_MS) { [weak self] in
        self?.fail(code: "PROBE_CONNECT_TIMEOUT", message: "Probe could not connect to the board")
      }
    }
  }

  // MARK: - VescGattListener (all on the main queue)

  func onDeviceDiscovered(id: String, name: String, rssi: Int, serviceUUIDs: [String]) {}
  func onScanFailure(_ message: String) {}
  func onGattConnected() {}
  func onGattSubscribing() {}

  func onGattReady() {
    if finished || phase != .connecting { return }
    cancelStep()
    emitProgress("handshake")
    phase = .pinging
    after(PROBE_FW_DELAY_MS) { [weak self] in
      guard let self, !self.finished else { return }
      _ = self.gatt.sendPayload([UInt8(COMM_FW_VERSION)])
    }
    after(PROBE_PING_DELAY_MS) { [weak self] in
      guard let self, !self.finished else { return }
      _ = self.gatt.sendPayload([UInt8(COMM_PING_CAN)])
    }
    armStep(PROBE_CAN_PING_TIMEOUT_MS) { [weak self] in self?.beginProbing() }
  }

  func onGattDisconnected(intentional: Bool, message: String) {
    if finished || intentional { return }
    if phase == .connecting {
      // Connect-phase drops are typically transient (a not-yet-released prior connection) —
      // retry a bounded number of times before giving up.
      if connectAttempts < PROBE_CONNECT_MAX_ATTEMPTS {
        cancelStep()
        attemptConnect(initial: false)
        return
      }
      fail(code: "PROBE_DISCONNECTED", message: "Board disconnected during probe")
    } else {
      // Dropped mid-detection: resolve with whatever was confirmed so far rather than hanging.
      finishResolved()
    }
  }

  func onGattFailure(code: String, message: String) {
    if !finished { fail(code: code, message: message) }
  }

  func onGattFrameChunk(_ chunk: [UInt8]) {
    if finished { return }
    for payload in reassembler.feed(chunk) { handlePayload(payload) }
  }

  private func handlePayload(_ payload: [UInt8]) {
    guard !payload.isEmpty else { return }
    switch Int(payload[0]) {
    case COMM_PING_CAN:
      // Collect EVERY responding CAN id, not just payload[1].
      if phase == .pinging {
        for i in 1..<payload.count { responders.insert(Int(payload[i])) }
      }
    case COMM_CUSTOM_APP_DATA:
      if phase == .probing, current != nil,
        parseRefloatGetAllData(payload: payload, avgLatency: nil, packetAt: nowMs(), pullRateHz: nil) != nil {
        markConfirmed()
      }
    case COMM_BMS_GET_VALUES:
      // Direct smart-BMS reply.
      if phase == .probing, current != nil, bmsValuesValid(payload) { markBms() }
    case COMM_FORWARD_CAN:
      // CAN-forwarded smart-BMS reply (telemetry stays bare, but BMS comes wrapped).
      if phase == .probing, current != nil, payload.count >= 3,
        Int(payload[2]) == COMM_BMS_GET_VALUES, bmsValuesValid(Array(payload[2...])) {
        markBms()
      }
    default:
      break
    }
  }

  // MARK: - Probe sequencing

  private func beginProbing() {
    if finished { return }
    phase = .probing
    emitProgress("probing")
    probeQueue = TransportDetection.candidatesToProbe(Array(responders))
    probeNext()
  }

  private func probeNext() {
    cancelStep()
    currentConfirmed = false
    currentHasBms = false
    guard !probeQueue.isEmpty else {
      current = nil
      finishResolved()
      return
    }
    let transport = probeQueue.removeFirst()
    current = transport
    // Ask for telemetry (confirms the transport) and BMS values (capability) in one window. The
    // BMS reply is best-effort: absence within the window means no BMS.
    sendProbeBurst(transport)
    // Re-send once mid-window in case the first request dropped.
    after(PROBE_TRANSPORT_TIMEOUT_MS / 2) { [weak self] in self?.sendProbeBurst(transport) }
    armStep(PROBE_TRANSPORT_TIMEOUT_MS) { [weak self] in self?.finalizeProbe() }
  }

  /// Send the telemetry then BMS request, staggered so each write lands rather than the second
  /// dropping a false "no BMS".
  private func sendProbeBurst(_ transport: BoardTransport) {
    if finished || current != transport { return }
    _ = gatt.sendPayload(transport.frame([
      UInt8(COMM_CUSTOM_APP_DATA), UInt8(REFLOAT_MAGIC), UInt8(REFLOAT_GET_ALLDATA), 2,
    ]))
    after(PROBE_BMS_DELAY_MS) { [weak self] in
      guard let self, !self.finished, self.current == transport else { return }
      _ = self.gatt.sendPayload(transport.frame([UInt8(COMM_BMS_GET_VALUES)]))
    }
  }

  /// Telemetry sample proves the transport works; mark and finish if BMS already seen.
  private func markConfirmed() {
    if currentConfirmed { return }
    currentConfirmed = true
    maybeFinishProbe()
  }

  /// A smart-BMS answered on the current transport.
  private func markBms() {
    currentHasBms = true
    maybeFinishProbe()
  }

  /// Finish early only once both signals are in. To assert "no BMS" we must wait the full window,
  /// so a confirmed-but-BMS-less transport rides the step timeout to `finalizeProbe`.
  private func maybeFinishProbe() {
    if currentConfirmed && currentHasBms { finalizeProbe() }
  }

  private func finalizeProbe() {
    guard let transport = current else { return }
    cancelStep()
    observations.append(
      TransportDetection.Probe(transport: transport, confirmed: currentConfirmed, hasBms: currentHasBms)
    )
    current = nil
    probeNext()
  }

  private func finishResolved() {
    if finished { return }
    let result = TransportDetection.resolve(observations)
    emitProgress("completed")
    cleanup()
    completeAfterGattRelease { [onComplete] in onComplete(result) }
  }

  private func fail(code: String, message: String) {
    if finished { return }
    emitProgress("failed")
    cleanup()
    completeAfterGattRelease { [onError] in onError(code, message) }
  }

  private func cleanup() {
    finished = true
    cancelStep()
    gatt.disconnect()
  }

  // MARK: - Timers (main queue)

  private func after(_ ms: Int, _ block: @escaping () -> Void) {
    DispatchQueue.main.asyncAfter(deadline: .now() + Double(ms) / 1000.0, execute: block)
  }

  private func armStep(_ ms: Int, _ action: @escaping () -> Void) {
    cancelStep()
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.stepWork = nil
      if !self.finished { action() }
    }
    stepWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + Double(ms) / 1000.0, execute: work)
  }

  private func cancelStep() {
    stepWork?.cancel()
    stepWork = nil
  }

  private func completeAfterGattRelease(_ action: @escaping () -> Void) {
    DispatchQueue.main.asyncAfter(
      deadline: .now() + Double(PROBE_GATT_RELEASE_DELAY_MS) / 1000.0,
      execute: action
    )
  }
}
