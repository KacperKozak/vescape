import Foundation
import UIKit

/// Rider-facing Board Session phase. Mirrors the Android `BoardPhase` wire contract the JS
/// layer depends on: `idle → connecting → discovering → subscribing → waiting_for_telemetry →
/// connected`, plus the mid-ride reconnect states `reconnecting → rescanning` (#58).
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/BoardPhase.kt
internal enum BoardPhase: String {
  case idle
  case connecting
  case discovering
  case subscribing
  case waitingForTelemetry = "waiting_for_telemetry"
  case connected
  case reconnecting
  case rescanning
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
/// transport, polls telemetry response-paced, decodes Refloat frames, emits live events, and
/// recovers a dropped mid-ride link via CoreBluetooth persistent connect plus active rescan
/// (#58), and owns iOS Ride Recording telemetry/GPS writes.
///
/// iOS reconnect deliberately diverges from Android's exponential-backoff `ReconnectScheduler`:
/// `CBCentralManager.connect(_:options:)` is persistent (retries until success or cancel, even
/// waking the app from suspension), so there is no per-attempt backoff to replicate. The active
/// rescan below only *supplements* that passive retry to accelerate rediscovery while the app is
/// alive under the `location` background mode.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/connection/ConnectionCoordinator.kt
/// @platform-diff iOS relies on CoreBluetooth persistent connect for retry timing instead of
/// Android's backoff scheduler, and still defers stale watchdog and alerts. Peers converge as
/// those iOS subsystems land (#61–#63).
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
  private let appData: AppDataRepository
  private lazy var recordingCoordinator = RecordingCoordinator(appData: appData)
  private lazy var gpsMonitor = VescGpsMonitor { [weak self] location in self?.onLocationUpdated(location) }
  private var latestLocation: TelemetryLocationCapture?
  private var latestPreciseLocation: TelemetryLocationCapture?
  private var recentLocations: [[String: Any?]] = []
  private var gpsError: String?

  private var pendingOnSuccess: (() -> Void)?
  private var pendingOnError: ((String, String) -> Void)?
  private var connectSettled = false

  // MARK: Reconnect state (#58)

  /// True from a mid-ride link drop until the GATT link is re-established or the session ends.
  /// Guards the rescan cycle timers so they stop the moment reconnect resolves or is torn down.
  private var reconnecting = false
  /// Active-scan window vs idle gap (ms) while reconnecting, tuned per app run-state: aggressive
  /// in the foreground, gentle under the `location` background mode to spare battery.
  private let rescanForegroundWindowMs = 4000
  private let rescanForegroundIdleMs = 2000
  private let rescanBackgroundWindowMs = 4000
  private let rescanBackgroundIdleMs = 12000

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

  init(appData: AppDataRepository = .shared) {
    self.appData = appData
  }

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
  func gpsActive() -> Bool { gpsMonitor.active }
  func gpsLatestLocation() -> [String: Any?]? { latestLocation?.map }
  func gpsLatestPreciseLocation() -> [String: Any?]? { latestPreciseLocation?.map }
  func gpsRecentLocations() -> [[String: Any?]] { recentLocations }
  func gpsLastError() -> String? { gpsError }
  func telemetryRecordingEnabled() -> Bool { recordingCoordinator.telemetryRecordingEnabled }
  func recordingStartedAt() -> Int64? { recordingCoordinator.recordingStartedAtMs }
  func recordingActiveBoardId() -> String? { recordingCoordinator.activeBoardId }

  func startLocationUpdates() {
    gpsError = gpsMonitor.start()
    onStateChanged?()
  }

  func stopLocationUpdates() {
    gpsMonitor.stop()
    onStateChanged?()
  }

  func setTelemetryRecordingEnabled(_ enabled: Bool) -> Bool {
    let ok = recordingCoordinator.setTelemetryRecordingEnabled(enabled)
    if enabled && ok { startLocationUpdates() }
    onStateChanged?()
    return ok
  }

  // MARK: - Session lifecycle

  private func beginSession(
    config: BoardConnectConfig,
    onSuccess: @escaping () -> Void,
    onError: @escaping (String, String) -> Void
  ) {
    session?.invalidate()
    stopPolling()
    stopReconnect()
    reassembler.reset()

    sessionSequence += 1
    session = BoardSession(id: sessionSequence)
    self.config = config
    recordingCoordinator.beginBoardSession(config: config)
    gpsError = gpsMonitor.start()
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
    recordingCoordinator.finishBoardSession(markerType: error == nil ? "disconnect" : "error")
    gpsMonitor.stop()
    stopPolling()
    stopReconnect()
    gatt.disconnect()
    reassembler.reset()
    connectedBoardId = nil
    bleId = nil
    boardName = nil
    boardError = error
    lastTelemetryAt = nil
    latestLocation = nil
    latestPreciseLocation = nil
    recentLocations.removeAll(keepingCapacity: true)
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
    recordingCoordinator.failSession()
    gpsMonitor.stop()
    stopPolling()
    stopReconnect()
    gatt.disconnect()
    emit?("onError", ["message": message])
    setPhase(.error)
  }

  // MARK: - Reconnect (#58)

  /// Recover a dropped mid-ride link. Bumps the Board Session identity so any poll/safety timers
  /// still armed under the dead link are discarded (stale-callback guard), hands the persistent
  /// reconnect to CoreBluetooth, and starts the supplemental rescan cycle. The JS `generation`
  /// (`connectionSeq`) is intentionally *not* bumped — the logical session survives the drop, so
  /// the live series keeps flowing once telemetry resumes (Android parity).
  private func beginReconnect() {
    guard config != nil else { return }
    session?.invalidate()
    stopPolling()
    reassembler.reset()

    sessionSequence += 1
    session = BoardSession(id: sessionSequence)
    reconnecting = true
    boardError = nil
    lastTelemetryAt = nil
    setPhase(.reconnecting)
    gatt.reconnect()
    if let session { scheduleRescanCycle(session: session) }
  }

  /// One active-scan window followed by an idle gap, re-armed until the link returns or the
  /// session ends. Persistent connect keeps retrying throughout; the scan just accelerates
  /// rediscovery while the app is alive.
  private func scheduleRescanCycle(session: BoardSession) {
    guard reconnecting, session === self.session, session.isActive else { return }
    setPhase(.rescanning)
    gatt.startReconnectScan()
    DispatchQueue.main.asyncAfter(deadline: .now() + Double(rescanWindowMs) / 1000.0) { [weak self] in
      guard let self, self.reconnecting, session === self.session, session.isActive else { return }
      self.gatt.stopReconnectScan()
      if self.phase == .rescanning { self.setPhase(.reconnecting) }
      DispatchQueue.main.asyncAfter(deadline: .now() + Double(self.rescanIdleMs) / 1000.0) { [weak self] in
        self?.scheduleRescanCycle(session: session)
      }
    }
  }

  private func stopReconnect() {
    guard reconnecting else { return }
    reconnecting = false
    gatt.stopReconnectScan()
  }

  private var appIsForeground: Bool {
    UIApplication.shared.applicationState == .active
  }

  private var rescanWindowMs: Int {
    appIsForeground ? rescanForegroundWindowMs : rescanBackgroundWindowMs
  }

  private var rescanIdleMs: Int {
    appIsForeground ? rescanForegroundIdleMs : rescanBackgroundIdleMs
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
    // Link re-established: the persistent connect landed, so drop the supplemental rescan and let
    // the normal discover → subscribe → telemetry phases carry the reconnect to `connected`.
    if reconnecting {
      reconnecting = false
      gatt.stopReconnectScan()
    }
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
      // Drop during the initial connect handshake stays a hard failure — the rider is actively
      // trying to connect and wants feedback, not a silent retry loop.
      fail(code: "DISCONNECTED", message: message)
    } else {
      // Established mid-ride link dropped: alerts are safety-critical, so recover automatically.
      beginReconnect()
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
    if let config {
      recordingCoordinator.markBoardReady(config: config)
    }
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
    if let latestPreciseLocation {
      tick["location"] = latestPreciseLocation.map
    }
    emit?("onLiveTick", tick)

    if let capture = telemetryCapture(telemetry) {
      recordingCoordinator.recordTelemetry(capture)
    }

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

  private func telemetryCapture(_ telemetry: RefloatTelemetry) -> TelemetryCapture? {
    guard let config else { return nil }
    let canId: Int?
    if case let .can(id) = config.transport {
      canId = id
    } else {
      canId = nil
    }
    return TelemetryCapture(
      capturedAtMs: telemetry.lastPacketAt,
      elapsedRealtimeMs: elapsedMs(),
      deviceId: config.bleId,
      deviceName: config.name,
      canId: canId,
      telemetry: telemetry,
      location: latestPreciseLocation
    )
  }

  private func onLocationUpdated(_ location: TelemetryLocationCapture) {
    latestLocation = location
    if location.precise {
      latestPreciseLocation = location
      recentLocations.append(location.map)
      pruneRecentLocations(now: location.timestamp)
    }
    emit?("onLocation", location.map)
  }

  private func pruneRecentLocations(now: Int64) {
    let windowMs = Int64(max(1, config?.liveHistoryLimitMinutes ?? 5)) * 60_000
    let oldest = now - windowMs
    recentLocations.removeAll { row in
      guard let timestamp = (row["timestamp"] ?? nil) as? NSNumber else { return false }
      return timestamp.int64Value < oldest
    }
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
  private func elapsedMs() -> Int64 { Int64(ProcessInfo.processInfo.systemUptime * 1000.0) }
}
