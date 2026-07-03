import Foundation

/// Rider-facing Board Session phase. Mirrors the Android `BoardPhase` wire contract the JS
/// layer depends on: `idle → connecting → discovering → subscribing → waiting_for_telemetry →
/// connected`.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/BoardPhase.kt
internal enum BoardPhase: String {
  case idle
  case connecting
  case discovering
  case subscribing
  case waitingForTelemetry = "waiting_for_telemetry"
  case connected
  case error
}

/// Everything a runtime connect needs, resolved from the stored Board Link before the session
/// starts. The transport is already known (ADR 0015 / #108) — connect never discovers it.
internal struct BoardConnectConfig {
  let appBoardId: String
  let bleId: String
  let name: String
  let transport: BoardTransport
  let pollIntervalMs: Int
  /// Normalized Board `batteryConfig` used to estimate battery percent, or `nil` when the board
  /// has no battery config (the gauge then stays empty).
  let batteryConfig: [String: Any]?
  /// Live-history window (minutes) for the decimated `onLiveSeries` series.
  let liveHistoryLimitMinutes: Int
}

/// Owns the live Board Session: drives connect phases off GATT callbacks, seeds the stored
/// transport, polls telemetry response-paced, decodes Refloat frames, and emits live events.
/// Deliberately narrower than Android's `BoardSessionController` — no reconnect, watchdog,
/// recording, or alerts yet (those land in later iOS slices).
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/connection/ConnectionCoordinator.kt
/// @platform-diff iOS starts with a minimal connect/telemetry slice; Android's controller also
/// owns reconnect, stale watchdog, recording, alerts, and GPS. Peers converge as those iOS
/// subsystems land (#58–#63).
internal final class ConnectionCoordinator: VescGattListener {
  /// Send a native event to JS. Set by the module.
  var emit: ((String, [String: Any?]) -> Void)?
  /// Called whenever board or scan phase changes so the module can recompose `onLiveState`.
  var onStateChanged: (() -> Void)?

  private lazy var gatt = VescGattClient(listener: self)
  private let connectTimeoutSeconds = 20.0

  // MARK: Board session state

  private(set) var phase: BoardPhase = .idle
  private(set) var connectedBoardId: String?
  private(set) var bleId: String?
  private(set) var boardName: String?
  private(set) var connectionSeq: Int64 = 0
  private(set) var lastTelemetryAt: Int64?
  private(set) var boardError: String?

  private var session: BoardSession?
  private var sessionSequence: Int64 = 0
  private var config: BoardConnectConfig?
  private let reassembler = VescPacketReassembler()
  private let batteryEstimator = BatterySocEstimator()
  private let liveSeries = LiveSeriesEmitter()

  private var pendingOnSuccess: (() -> Void)?
  private var pendingOnError: ((String, String) -> Void)?
  private var connectSettled = false

  // MARK: Scan state

  private(set) var scanPhase = "idle"
  private(set) var scanError: String?

  // MARK: Polling state

  private var polling = false
  private var floorMs = 0
  private var lastPollAt: Int64 = 0
  private var smoothedPeriodMs = 0.0
  private var pollTick: Int64 = 0

  // Batched history flush cadence (cold path); the hot `onLiveTick` fires every frame.
  private var historyBuffer: [[String: Any?]] = []
  private var lastHistoryFlushAt: Int64 = 0
  private let historyFlushIntervalMs: Int64 = 300

  // MARK: - Scan API

  func scan() {
    scanError = nil
    scanPhase = "scanning"
    gatt.startScan()
    onStateChanged?()
  }

  func stopScan() {
    gatt.stopScan()
    scanPhase = "idle"
    onStateChanged?()
  }

  // MARK: - Connect API

  func connect(
    config: BoardConnectConfig,
    onSuccess: @escaping () -> Void,
    onError: @escaping (String, String) -> Void
  ) {
    batteryEstimator.ensureLoaded()
    liveSeries.emit = { [weak self] name, body in self?.emit?(name, body) }
    liveSeries.generation = { [weak self] in self?.connectionSeq ?? 0 }
    liveSeries.setWindowMinutes(config.liveHistoryLimitMinutes)
    beginSession(config: config, onSuccess: onSuccess, onError: onError)
    gatt.connect(peripheralId: config.bleId)
    armConnectTimeout()
  }

  func stopBoard() {
    endSession(phase: .idle, error: nil)
  }

  // MARK: - Live-state snapshot

  func remoteTiltState() -> [String: Any?]? { nil }

  // MARK: - Session lifecycle

  private func beginSession(
    config: BoardConnectConfig,
    onSuccess: @escaping () -> Void,
    onError: @escaping (String, String) -> Void
  ) {
    session?.invalidate()
    stopPolling()
    reassembler.reset()

    sessionSequence += 1
    session = BoardSession(id: sessionSequence)
    self.config = config
    connectionSeq = sessionSequence
    connectedBoardId = config.appBoardId
    bleId = config.bleId
    boardName = config.name
    boardError = nil
    lastTelemetryAt = nil
    pendingOnSuccess = onSuccess
    pendingOnError = onError
    connectSettled = false
    setPhase(.connecting)
  }

  private func endSession(phase: BoardPhase, error: String?) {
    session?.invalidate()
    session = nil
    config = nil
    stopPolling()
    gatt.disconnect()
    reassembler.reset()
    connectedBoardId = nil
    bleId = nil
    boardName = nil
    boardError = error
    lastTelemetryAt = nil
    settleConnect(success: false, code: error == nil ? nil : "DISCONNECTED", message: error)
    setPhase(phase)
  }

  private func settleConnect(success: Bool, code: String?, message: String?) {
    guard !connectSettled else { return }
    connectSettled = true
    if success {
      pendingOnSuccess?()
    } else if let onError = pendingOnError {
      onError(code ?? "ERROR", message ?? "Board session ended")
    }
    pendingOnSuccess = nil
    pendingOnError = nil
  }

  private func armConnectTimeout() {
    let token = session
    DispatchQueue.main.asyncAfter(deadline: .now() + connectTimeoutSeconds) { [weak self] in
      guard let self, let token, token === self.session, token.isActive else { return }
      if self.phase == .connecting || self.phase == .discovering || self.phase == .subscribing {
        self.fail(code: "TIMEOUT", message: "Board did not become ready in time")
      }
    }
  }

  private func setPhase(_ phase: BoardPhase) {
    guard self.phase != phase else { return }
    self.phase = phase
    onStateChanged?()
  }

  private func fail(code: String, message: String) {
    settleConnect(success: false, code: code, message: message)
    boardError = message
    session?.invalidate()
    session = nil
    config = nil
    stopPolling()
    gatt.disconnect()
    emit?("onError", ["message": message])
    setPhase(.error)
  }

  // MARK: - VescGattListener

  func onDeviceDiscovered(id: String, name: String, rssi: Int, serviceUUIDs: [String]) {
    emit?("onDevice", [
      "id": id,
      "name": name,
      "rssi": rssi,
      "serviceUUIDs": serviceUUIDs,
    ])
  }

  func onScanFailure(_ message: String) {
    scanPhase = "error"
    scanError = message
    emit?("onError", ["message": message])
    onStateChanged?()
  }

  func onGattConnected() {
    guard session != nil else { return }
    setPhase(.discovering)
  }

  func onGattSubscribing() {
    guard session != nil else { return }
    setPhase(.subscribing)
  }

  func onGattReady() {
    guard let session else { return }
    boardError = nil
    setPhase(.waitingForTelemetry)
    settleConnect(success: true, code: nil, message: nil)
    startPolling(session: session)
  }

  func onGattFailure(code: String, message: String) {
    guard session != nil else { return }
    fail(code: code, message: message)
  }

  func onGattDisconnected(intentional: Bool, message: String) {
    if intentional { return }
    guard session != nil else { return }
    if !connectSettled {
      fail(code: "DISCONNECTED", message: message)
    } else {
      endSession(phase: .error, error: message)
    }
  }

  func onGattFrameChunk(_ chunk: [UInt8]) {
    guard session != nil else { return }
    for payload in reassembler.feed(chunk) {
      handlePayload(payload)
    }
  }

  // MARK: - Telemetry

  private func handlePayload(_ payload: [UInt8]) {
    guard let session, session.isActive else { return }
    guard !payload.isEmpty, Int(payload[0]) == COMM_CUSTOM_APP_DATA else { return }
    let now = nowMs()
    guard let telemetry = parseRefloatGetAllData(
      payload: payload,
      avgLatency: latency(at: now),
      packetAt: now,
      pullRateHz: measuredRateHz()
    ) else { return }

    onPollResponse(session: session)
    lastTelemetryAt = now
    markBoardReady()
    emitTelemetry(telemetry)
  }

  private func markBoardReady() {
    guard phase == .waitingForTelemetry else { return }
    boardError = nil
    setPhase(.connected)
  }

  private func emitTelemetry(_ telemetry: RefloatTelemetry) {
    // Hot path: a scalar tick every frame drives the live gauges.
    var tick = telemetry.toMap()
    tick["batteryPercent"] = batteryEstimator.estimateBatteryPercent(
      voltageV: telemetry.batteryVoltage,
      config: config?.batteryConfig,
      batteryCurrentA: telemetry.batteryCurrent
    )
    tick["generation"] = connectionSeq
    tick["remoteTilt"] = nil
    emit?("onLiveTick", tick)

    // Decimated ~1Hz series for sparklines + battery gauge (native downsamples the live window).
    liveSeries.add(tick)

    // Cold path: full samples batched a few times a second for history + charts.
    historyBuffer.append(tick)
    let now = telemetry.lastPacketAt
    if lastHistoryFlushAt == 0 || now - lastHistoryFlushAt >= historyFlushIntervalMs {
      flushHistory()
    }
  }

  private func flushHistory() {
    guard !historyBuffer.isEmpty else { return }
    emit?("onTelemetryHistory", ["samples": historyBuffer])
    historyBuffer.removeAll(keepingCapacity: true)
    lastHistoryFlushAt = nowMs()
  }

  // MARK: - Polling (response-paced; ADR 0015 dumb connect)

  private func startPolling(session: BoardSession) {
    floorMs = max(0, config?.pollIntervalMs ?? 0)
    lastPollAt = 0
    smoothedPeriodMs = 0
    pollTick = 0
    lastHistoryFlushAt = 0
    historyBuffer.removeAll(keepingCapacity: true)
    polling = true
    liveSeries.start()
    sendPoll(session: session)
  }

  private func stopPolling() {
    polling = false
    liveSeries.stop()
    flushHistory()
  }

  private func pollPayload() -> [UInt8] {
    let transport = config?.transport ?? .direct
    return transport.frame([
      UInt8(COMM_CUSTOM_APP_DATA),
      UInt8(REFLOAT_MAGIC),
      UInt8(REFLOAT_GET_ALLDATA),
      2,
    ])
  }

  private func sendPoll(session: BoardSession) {
    guard polling, session === self.session, session.isActive else { return }
    let now = nowMs()
    if lastPollAt > 0 {
      let delta = Double(now - lastPollAt)
      smoothedPeriodMs = smoothedPeriodMs <= 0 ? delta : smoothedPeriodMs + 0.2 * (delta - smoothedPeriodMs)
    }
    lastPollAt = now
    _ = gatt.sendPayload(pollPayload())
    pollTick += 1
    armSafety(session: session, tick: pollTick)
  }

  private func onPollResponse(session: BoardSession) {
    guard polling, session === self.session, session.isActive else { return }
    let elapsed = nowMs() - lastPollAt
    let delayMs = max(0, Int64(floorMs) - elapsed)
    DispatchQueue.main.asyncAfter(deadline: .now() + Double(delayMs) / 1000.0) { [weak self] in
      self?.sendPoll(session: session)
    }
  }

  /// Safety re-poll: if no reply lands within the window, assume a dropped request/reply and
  /// re-poll so the loop self-heals instead of stalling.
  private func armSafety(session: BoardSession, tick: Int64) {
    let timeoutMs = max(Int64(floorMs) * 4, 1000)
    DispatchQueue.main.asyncAfter(deadline: .now() + Double(timeoutMs) / 1000.0) { [weak self] in
      guard let self, self.polling, session === self.session, session.isActive, self.pollTick == tick else { return }
      self.sendPoll(session: session)
    }
  }

  private func measuredRateHz() -> Double? {
    smoothedPeriodMs > 0 ? 1000.0 / smoothedPeriodMs : nil
  }

  private func latency(at now: Int64) -> Int? {
    lastPollAt > 0 ? Int(max(0, now - lastPollAt)) : nil
  }

  private func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
}
