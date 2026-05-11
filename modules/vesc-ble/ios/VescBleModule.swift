import ExpoModulesCore
import Foundation

// iOS simulator mock.
// Emits realistic fake data so the UI can be explored without real BLE hardware.
// A full CoreBluetooth implementation can replace this when needed.
public class VescBleModule: Module {

  // MARK: - Session state

  private var sessionStatus = "idle"
  private var selectedBoardId: String? = nil
  private var sessionDeviceId: String? = nil
  private var sessionDeviceName: String? = nil

  // MARK: - Timers

  private var scanTimer: Timer?
  private var telemetryTimer: Timer?
  private var locationTimer: Timer?

  // MARK: - Mock data state

  private var tick = 0
  private var mockOdometer = 0.0
  private var mockLat = 52.2297
  private var mockLon = 21.0122
  private var scanDeviceIndex = 0
  private var boards = Self.loadArray(key: "vesc_ble_boards")
  private var alertRules = Self.loadArray(key: "vesc_ble_alert_rules")

  private let mockDevices: [[String: Any]] = [
    [
      "id": "AA:BB:CC:DD:EE:01",
      "name": "FloatWheel ADV",
      "rssi": -45,
      "serviceUUIDs": ["6e400001-b5a3-f393-e0a9-e50e24dcca9e"],
    ],
    [
      "id": "AA:BB:CC:DD:EE:02",
      "name": "VESC Board Pro",
      "rssi": -62,
      "serviceUUIDs": ["6e400001-b5a3-f393-e0a9-e50e24dcca9e"],
    ],
    [
      "id": "AA:BB:CC:DD:EE:03",
      "name": "Refloat GT",
      "rssi": -78,
      "serviceUUIDs": ["6e400001-b5a3-f393-e0a9-e50e24dcca9e"],
    ],
  ]

  // MARK: - Module definition

  public func definition() -> ModuleDefinition {
    Name("VescBle")

    Events("onDevice", "onError", "onLiveState", "onTelemetry", "onLocation")

    OnDestroy {
      self.scanTimer?.invalidate()
      self.telemetryTimer?.invalidate()
      self.locationTimer?.invalidate()
    }

    // MARK: Scan

    Function("scan") {
      self.startMockScan()
    }

    Function("stopScan") {
      self.stopScan()
    }

    // MARK: Location

    Function("startLocationUpdates") {
      self.startMockLocation()
    }

    Function("stopLocationUpdates") {
      self.stopLocation()
    }

    // MARK: Telemetry recording toggle (no-op on mock)

    Function("setTelemetryRecordingEnabled") { (_: Bool) in
      // No persistent storage in the iOS mock
    }

    Function("reloadAlertRules") {
      // no-op in iOS simulator mock
    }

    Function("previewAlertSound") { (_: String) in
      // no-op in iOS simulator mock
    }

    // MARK: Board session

    Function("getLiveState") {
      self.liveState()
    }

    Function("setSelectedBoard") { (boardId: String?) in
      self.selectedBoardId = boardId
      var settings = Self.loadSettings()
      settings["selectedBoardId"] = boardId
      Self.saveSettings(settings)
    }

    Function("setDebugRecordingEnabled") { (_: Bool) in
      // Debug raw BLE recording is Android-only.
    }

    AsyncFunction("selectBoard") { (boardId: String, promise: Promise) in
      self.selectedBoardId = boardId
      var settings = Self.loadSettings()
      settings["selectedBoardId"] = boardId
      Self.saveSettings(settings)
      let board = self.boards.first { ($0["id"] as? String) == boardId }
      let deviceId = board?["bleId"] as? String ?? "MOCK-ID"
      let deviceName = board?["name"] as? String ?? "Mock Board"
      self.startMockBoard(deviceId: deviceId, deviceName: deviceName)
      promise.resolve(nil)
    }

    AsyncFunction("stopBoard") { (promise: Promise) in
      DispatchQueue.main.async { [weak self] in self?.stopMockSession() }
      promise.resolve(nil)
    }

    // MARK: Telemetry history (empty stubs)

    AsyncFunction("getTelemetryHistory") { (_: [String: Any], promise: Promise) in
      promise.resolve([] as [Any])
    }

    AsyncFunction("getTelemetrySamples") { (_: [String: Any], promise: Promise) in
      promise.resolve([] as [Any])
    }

    AsyncFunction("getHistoryRange") { (_: [String: Any], promise: Promise) in
      promise.resolve([
        "boardSamples": [] as [Any],
        "gpsSamples": [] as [Any],
        "markers": [] as [Any],
      ])
    }

    AsyncFunction("getTelemetrySummary") { (promise: Promise) in
      promise.resolve([
        "sampleCount": 0,
        "gpsPointCount": 0,
        "firstAtMs": nil,
        "lastAtMs": nil,
        "droppedPendingSamples": 0,
      ] as [String: Any?])
    }

    AsyncFunction("deleteTelemetryBefore") { (_: Double, promise: Promise) in
      promise.resolve(0)
    }

    AsyncFunction("deleteTelemetryRange") { (_: [String: Any], promise: Promise) in
      promise.resolve(0)
    }

    AsyncFunction("clearTelemetryHistory") { (promise: Promise) in
      promise.resolve(nil)
    }

    AsyncFunction("getBoards") { (promise: Promise) in
      promise.resolve(self.boards.sorted(by: Self.sortBoards))
    }

    AsyncFunction("upsertBoard") { (board: [String: Any], promise: Promise) in
      self.upsert(&self.boards, item: board)
      self.saveAppData()
      promise.resolve(nil)
    }

    AsyncFunction("deleteBoard") { (id: String, promise: Promise) in
      self.boards.removeAll { ($0["id"] as? String) == id }
      self.saveAppData()
      promise.resolve(nil)
    }

    AsyncFunction("getAlertRules") { (promise: Promise) in
      promise.resolve(self.alertRules.sorted(by: Self.sortByCreatedAt))
    }

    AsyncFunction("upsertAlertRule") { (rule: [String: Any], promise: Promise) in
      self.upsert(&self.alertRules, item: rule)
      self.saveAppData()
      promise.resolve(nil)
    }

    AsyncFunction("setAlertRuleEnabled") { (id: String, enabled: Bool, promise: Promise) in
      self.alertRules = self.alertRules.map { rule in
        guard (rule["id"] as? String) == id else { return rule }
        var next = rule
        next["enabled"] = enabled
        return next
      }
      self.saveAppData()
      promise.resolve(nil)
    }

    AsyncFunction("deleteAlertRule") { (id: String, promise: Promise) in
      self.alertRules.removeAll { ($0["id"] as? String) == id }
      self.saveAppData()
      promise.resolve(nil)
    }

    AsyncFunction("getSettings") { (promise: Promise) in
      promise.resolve(Self.loadSettings())
    }

    AsyncFunction("updateSetting") { (key: String, value: Any?, promise: Promise) in
      var settings = Self.loadSettings()
      settings[key] = value
      Self.saveSettings(settings)
      promise.resolve(nil)
    }
  }

  // MARK: - Scan

  private func startMockScan() {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.scanTimer?.invalidate()
      self.scanDeviceIndex = 0
      self.scanTimer = Timer.scheduledTimer(withTimeInterval: 0.7, repeats: true) { [weak self] _ in
        guard let self = self else { return }
        let device = self.mockDevices[self.scanDeviceIndex % self.mockDevices.count]
        var event = device
        event["rssi"] = (device["rssi"] as! Int) + Int.random(in: -5...5)
        self.sendEvent("onDevice", event)
        self.scanDeviceIndex += 1
      }
    }
  }

  private func stopScan() {
    DispatchQueue.main.async { [weak self] in
      self?.scanTimer?.invalidate()
      self?.scanTimer = nil
    }
  }

  // MARK: - Location

  private func startMockLocation() {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.locationTimer?.invalidate()
      self.locationTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
        guard let self = self else { return }
        self.mockLat += Double.random(in: -0.0001...0.0001)
        self.mockLon += Double.random(in: -0.0001...0.0001)
        self.sendEvent("onLocation", [
          "latitude": self.mockLat,
          "longitude": self.mockLon,
          "speedMps": Double.random(in: 0...5),
          "bearingDeg": Double.random(in: 0...360),
          "accuracyM": Double.random(in: 3...10),
          "altitudeM": 120.0,
          "timestamp": Date().timeIntervalSince1970 * 1000.0,
          "precise": true,
          "saved": false,
        ] as [String: Any])
      }
    }
  }

  private func stopLocation() {
    DispatchQueue.main.async { [weak self] in
      self?.locationTimer?.invalidate()
      self?.locationTimer = nil
    }
  }

  // MARK: - Telemetry

  private func startTelemetryTimer() {
    telemetryTimer?.invalidate()
    tick = 0
    mockOdometer = 0.0
    telemetryTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
      guard let self = self else { return }
      self.emitMockTelemetry()
    }
  }

  private func startMockBoard(deviceId: String, deviceName: String) {
    sessionDeviceId = deviceId
    sessionDeviceName = deviceName
    sessionStatus = "connecting"
    sendEvent("onLiveState", liveState())

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
      guard let self = self else { return }
      self.sessionStatus = "connected"
      self.sendEvent("onLiveState", self.liveState())
      self.startTelemetryTimer()
    }
  }

  private func stopMockSession() {
    telemetryTimer?.invalidate()
    telemetryTimer = nil
    sessionStatus = "idle"
    sessionDeviceId = nil
    sessionDeviceName = nil
    sendEvent("onLiveState", liveState())
  }

  private func liveState() -> [String: Any?] {
    let settings = Self.loadSettings()
    let gpsActive = locationTimer != nil
    return [
      "board": [
        "phase": sessionStatus,
        "selectedBoardId": selectedBoardId ?? settings["selectedBoardId"],
        "connectedBoardId": sessionStatus == "idle" ? nil : selectedBoardId,
        "bleId": sessionDeviceId,
        "name": sessionDeviceName,
        "connectionSeq": 0,
        "lastTelemetryAt": nil,
        "recentTelemetry": [] as [Any],
        "error": nil,
        "autoConnect": settings["autoConnect"] as? Bool ?? true,
      ] as [String: Any?],
      "gps": [
        "phase": gpsActive ? "active" : "idle",
        "latestFix": nil,
        "recentLocations": [] as [Any],
        "error": nil,
      ] as [String: Any?],
      "scan": [
        "phase": scanTimer == nil ? "idle" : "scanning",
        "devices": [] as [Any],
        "error": nil,
      ] as [String: Any?],
      "recording": [
        "enabled": false,
        "activeBoardId": nil,
        "startedAt": nil,
      ] as [String: Any?],
    ]
  }

  private func emitMockTelemetry() {
    let t = Double(tick)
    tick += 1

    // Speed: 0–25 km/h sine wave with ~30 s period
    let speed = 12.5 + 12.5 * sin(t * 0.1)
    let erpm = speed * 300.0

    // Attitude
    let pitch = 3.0 * sin(t * 0.3)
    let roll = 5.0 * sin(t * 0.17 + 1.0)
    let balancePitch = 2.8 * sin(t * 0.3 - 0.1)
    let balanceCurrent = 1.5 * sin(t * 0.4)

    // Power
    let dutyCycle = min(0.8, max(0.0, speed / 50.0))
    let motorCurrent = 12.5 * cos(t * 0.1)
    let batteryCurrent = motorCurrent * dutyCycle
    let batteryVoltage = max(50.0, 58.0 - t * 0.002 + 0.3 * sin(t * 0.05))

    // Footpads — both pressed
    let adc1 = 0.85 + 0.05 * sin(t * 0.2)
    let adc2 = 0.88 + 0.04 * sin(t * 0.15)

    // Temperatures — slowly rising
    let tempMosfet = min(70.0, 35.0 + t * 0.02 + 2.0 * sin(t * 0.03))
    let tempMotor = min(60.0, 28.0 + t * 0.015)

    // Odometer: speed (km/h) → m/s × 0.5 s interval
    mockOdometer += abs(speed) / 3.6 * 0.5

    sendEvent("onTelemetry", [
      "hasFault": false,
      "faultCode": 0,
      "pitch": pitch,
      "roll": roll,
      "balancePitch": balancePitch,
      "balanceCurrent": balanceCurrent,
      "speed": speed,
      "batteryVoltage": batteryVoltage,
      "motorCurrent": motorCurrent,
      "batteryCurrent": batteryCurrent,
      "erpm": erpm,
      "dutyCycle": dutyCycle,
      "state": 1,
      "stateName": "RUNNING",
      "switchState": 2,
      "adc1": adc1,
      "adc2": adc2,
      "odometer": mockOdometer,
      "tempMosfet": tempMosfet,
      "tempMotor": tempMotor,
      "avgLatency": 12.0,
      "lastPacketAt": Date().timeIntervalSince1970 * 1000.0,
      "location": nil,
    ] as [String: Any?])
  }

  private func saveAppData() {
    Self.saveArray(boards, key: "vesc_ble_boards")
    Self.saveArray(alertRules, key: "vesc_ble_alert_rules")
  }

  private func upsert(_ array: inout [[String: Any?]], item: [String: Any]) {
    let normalized = item.reduce(into: [String: Any?]()) { result, entry in
      result[entry.key] = entry.value
    }
    guard let id = normalized["id"] as? String else { return }
    if let index = array.firstIndex(where: { ($0["id"] as? String) == id }) {
      array[index] = normalized
    } else {
      array.append(normalized)
    }
  }

  private static func sortBoards(_ lhs: [String: Any?], _ rhs: [String: Any?]) -> Bool {
    let leftStarred = lhs["isStarred"] as? Bool ?? false
    let rightStarred = rhs["isStarred"] as? Bool ?? false
    if leftStarred != rightStarred { return leftStarred }
    return createdAt(lhs) < createdAt(rhs)
  }

  private static func sortByCreatedAt(_ lhs: [String: Any?], _ rhs: [String: Any?]) -> Bool {
    createdAt(lhs) < createdAt(rhs)
  }

  private static func createdAt(_ item: [String: Any?]) -> Double {
    item["createdAt"] as? Double ?? Double(item["createdAt"] as? Int ?? 0)
  }

  private static func loadArray(key: String) -> [[String: Any?]] {
    guard
      let data = UserDefaults.standard.data(forKey: key),
      let raw = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else {
      return []
    }
    return raw.map { item in item.reduce(into: [String: Any?]()) { $0[$1.key] = $1.value } }
  }

  private static func saveArray(_ array: [[String: Any?]], key: String) {
    let normalized = array.map { item in item.compactMapValues { $0 } }
    guard let data = try? JSONSerialization.data(withJSONObject: normalized) else { return }
    UserDefaults.standard.set(data, forKey: key)
  }

  private static let defaultSettings: [String: Any] = [
    "liveHistoryLimit": 5,
    "autoConnect": true,
    "autoRecording": false,
    "selectedBoardId": NSNull(),
  ]

  private static func loadSettings() -> [String: Any] {
    guard
      let data = UserDefaults.standard.data(forKey: "vesc_ble_settings"),
      let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return defaultSettings
    }
    var merged = defaultSettings
    for (k, v) in raw { merged[k] = v }
    return merged
  }

  private static func saveSettings(_ settings: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: settings) else { return }
    UserDefaults.standard.set(data, forKey: "vesc_ble_settings")
  }
}
