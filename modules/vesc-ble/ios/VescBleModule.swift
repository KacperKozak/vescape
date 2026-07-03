import ExpoModulesCore
import Foundation

// iOS bridge stub.
// Board features must use real CoreBluetooth; until that lands, fail explicitly
// instead of emitting fake devices or telemetry on physical iOS builds.
public class VescBleModule: Module {

  // MARK: - Session state

  private var sessionStatus = "idle"
  private var selectedBoardId: String? = nil
  private var sessionDeviceId: String? = nil
  private var sessionDeviceName: String? = nil
  private var sessionGeneration = 0

  // MARK: - Timers

  private var scanTimer: Timer?
  private var telemetryTimer: Timer?
  private var locationTimer: Timer?
  // MARK: - App data state

  private var boards = VescBleModule.loadArray(key: "vesc_ble_boards")
  private var alertRules = VescBleModule.loadArray(key: "vesc_ble_alert_rules")
  private var privacyZones = VescBleModule.loadArray(key: "vesc_ble_privacy_zones")
  private var mapPoints = VescBleModule.loadArray(key: "vesc_ble_map_points")

  // MARK: - Module definition

  public func definition() -> ModuleDefinition {
    Name("VescBle")

    Events("onDevice", "onError", "onLiveState", "onLiveTick", "onLiveSeries", "onTelemetryHistory", "onBms", "onLocation", "onTelemetryRebuildProgress", "onBoardProbeProgress", "onGroupRideConnection", "onGroupRideSnapshot", "onGroupRideCreated", "onGroupRideUpdated", "onGroupRideEnded", "onGroupRideJoined", "onGroupRideRoster", "onGroupRideError")

    OnDestroy {
      self.scanTimer?.invalidate()
      self.telemetryTimer?.invalidate()
      self.locationTimer?.invalidate()
    }

    // MARK: Scan

    Function("scan") {
      self.stopScan()
      self.emitUnsupported("scan", "iOS CoreBluetooth scan is not implemented yet")
    }

    Function("stopScan") {
      self.stopScan()
    }

    // MARK: Location

    Function("startLocationUpdates") {
      self.stopLocation()
      self.emitUnsupported("location", "iOS location updates are not implemented yet")
    }

    Function("stopLocationUpdates") {
      self.stopLocation()
    }

    // MARK: Group Ride (Android native implementation; iOS keeps bridge shape)

    Function("startGroupRideObserve") { (_: String) in
      self.sendEvent("onGroupRideConnection", ["state": "idle"])
      self.sendEvent("onGroupRideSnapshot", ["rides": []])
    }

    Function("stopGroupRideObserve") {
      self.sendEvent("onGroupRideConnection", ["state": "idle"])
    }

    Function("createGroupRide") { (_: String, _: String, _: String?, _: String?, _: Double, _: Double) in
      // no-op until iOS native Group Ride support lands
    }

    Function("joinGroupRide") { (_: String, _: String, _: String?, _: String) in
      // no-op until iOS native Group Ride support lands
    }

    Function("leaveGroupRide") {
      self.sendEvent("onGroupRideJoined", ["rideId": nil])
      self.sendEvent("onGroupRideRoster", ["rideId": nil, "riders": []])
    }

    Function("updateGroupRideIdentity") { (_: String, _: String, _: String?) in
      // no-op until iOS native Group Ride support lands
    }

    // MARK: Telemetry recording toggle

    Function("setTelemetryRecordingEnabled") { (_: Bool) in
      // No persistent storage until iOS storage lands.
    }

    Function("reloadAlertRules") {
      // no-op until iOS native alert evaluation lands
    }

    Function("previewAlertSound") { (_: String) in
      // no-op until iOS native alert playback lands
    }

    Function("getAlertPresets") {
      [
        ["name": "Beep", "uri": "preset:beep", "category": "single"],
        ["name": "Urgent", "uri": "preset:urgent", "category": "single"],
        ["name": "Notify", "uri": "preset:notify", "category": "single"],
        ["name": "Tick", "uri": "preset:tick", "category": "geiger"],
        ["name": "Hard Tick", "uri": "preset:tick_hard", "category": "geiger"],
        ["name": "Gamma", "uri": "preset:gamma", "category": "geiger"],
      ]
    }

    Function("startGeigerSimulation") { (_: String, _: Double) in
      // no-op until iOS native alert playback lands
    }

    Function("stopGeigerSimulation") {
      // no-op until iOS native alert playback lands
    }

    // MARK: Board session

    Function("getLiveState") {
      self.liveState()
    }

    Function("getRemoteTiltState") { () -> [String: Any]? in
      nil
    }

    Function("setSelectedBoard") { (boardId: String?) in
      self.selectedBoardId = boardId
      var settings = Self.loadSettings()
      settings["selectedBoardId"] = boardId
      Self.saveSettings(settings)
    }

    AsyncFunction("setCompanionPresenceEnabled") { (enabled: Bool, promise: Promise) in
      promise.reject("UNSUPPORTED_PLATFORM", "Companion presence is Android-only")
    }

    Function("setDebugRecordingEnabled") { (_: Bool) in
      // Debug raw BLE recording is Android-only.
    }

    AsyncFunction("listDebugRecordings") { () -> [[String: Any]] in
      []
    }

    AsyncFunction("exportDebugRecording") { (_: String, promise: Promise) in
      promise.reject("UNSUPPORTED_PLATFORM", "Debug recording export is Android-only")
    }

    AsyncFunction("selectBoard") { (boardId: String, promise: Promise) in
      self.selectedBoardId = boardId
      var settings = Self.loadSettings()
      settings["selectedBoardId"] = boardId
      Self.saveSettings(settings)
      self.stopNativeSession()
      promise.reject("UNSUPPORTED_PLATFORM", "iOS CoreBluetooth board sessions are not implemented yet")
    }

    AsyncFunction("stopBoard") { (promise: Promise) in
      DispatchQueue.main.async { [weak self] in self?.stopNativeSession() }
      promise.resolve(nil)
    }

    AsyncFunction("probeBoardLink") { (_: String, promise: Promise) in
      DispatchQueue.main.async { [weak self] in self?.stopNativeSession() }
      promise.reject("UNSUPPORTED_PLATFORM", "iOS Board Probe requires the CoreBluetooth implementation")
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

    AsyncFunction("getDiagnosticEvents") { (_: [String: Any], promise: Promise) in
      promise.resolve([] as [Any])
    }

    AsyncFunction("clearDiagnosticEvents") { (promise: Promise) in
      promise.resolve(nil)
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

    AsyncFunction("getDatabaseSizeBytes") { () -> Int in
      return 0
    }

    AsyncFunction("backupDatabase") { (promise: Promise) in
      promise.reject("UNSUPPORTED_PLATFORM", "Database backup is Android-only until iOS storage is implemented")
    }

    AsyncFunction("restoreDatabase") { (_: String, promise: Promise) in
      promise.reject("UNSUPPORTED_PLATFORM", "Database restore is Android-only until iOS storage is implemented")
    }

    AsyncFunction("getRefloatConfigSnapshot") { (promise: Promise) in
      promise.reject(
        "UNSUPPORTED_PLATFORM",
        "Refloat config reading is Android-only until iOS BLE transport is implemented"
      )
    }

    AsyncFunction("setRemoteTilt") { (_: Int) -> Bool in
      false
    }

    AsyncFunction("lockRemoteTilt") { (_: Int) -> Bool in
      false
    }

    AsyncFunction("releaseRemoteTilt") { (_: Int, _: Int) -> Bool in
      false
    }

    AsyncFunction("stopRemoteTilt") { () -> Bool in
      false
    }

    Function("getRemoteTiltState") { () -> [String: Any]? in
      nil
    }

    AsyncFunction("getTuneProfiles") { (_: String, promise: Promise) in
      promise.resolve([] as [Any])
    }

    AsyncFunction("getTuneProfile") { (_: String, promise: Promise) in
      promise.resolve(nil)
    }

    AsyncFunction("getTotalProfileStats") { (promise: Promise) in
      promise.resolve(Self.emptyProfileStats())
    }

    AsyncFunction("getMonthlyProfileStats") { (_: [String: Any], promise: Promise) in
      promise.resolve(Self.emptyProfileStats())
    }

    AsyncFunction("getProfileStatMonths") { (promise: Promise) in
      promise.resolve([] as [Any])
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
      promise.resolve(self.boards.map(Self.normalizeBoard).sorted(by: Self.sortBoards))
    }

    AsyncFunction("upsertBoard") { (board: [String: Any], promise: Promise) in
      self.upsert(&self.boards, item: Self.normalizeBoard(board))
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

    AsyncFunction("getPrivacyZones") { (promise: Promise) in
      promise.resolve(self.privacyZones.sorted(by: Self.sortByCreatedAt))
    }

    AsyncFunction("upsertPrivacyZone") { (zone: [String: Any], promise: Promise) in
      self.upsert(&self.privacyZones, item: zone)
      self.saveAppData()
      promise.resolve(nil)
    }

    AsyncFunction("setPrivacyZoneEnabled") { (id: String, enabled: Bool, promise: Promise) in
      self.privacyZones = self.privacyZones.map { zone in
        guard (zone["id"] as? String) == id else { return zone }
        var next = zone
        next["enabled"] = enabled
        next["updatedAt"] = Date().timeIntervalSince1970 * 1000.0
        return next
      }
      self.saveAppData()
      promise.resolve(nil)
    }

    AsyncFunction("deletePrivacyZone") { (id: String, promise: Promise) in
      self.privacyZones.removeAll { ($0["id"] as? String) == id }
      self.saveAppData()
      promise.resolve(nil)
    }

    AsyncFunction("getMapPoints") { (promise: Promise) in
      promise.resolve(self.mapPoints.sorted(by: Self.sortByCreatedAt))
    }

    AsyncFunction("upsertMapPoint") { (point: [String: Any], promise: Promise) in
      self.upsert(&self.mapPoints, item: point)
      self.saveAppData()
      promise.resolve(nil)
    }

    AsyncFunction("replaceDirectionMapPoint") { (point: [String: Any], promise: Promise) in
      var directionPoint = point
      directionPoint["kind"] = "direction"
      self.mapPoints.removeAll { ($0["kind"] as? String) == "direction" }
      self.upsert(&self.mapPoints, item: directionPoint)
      self.saveAppData()
      promise.resolve(nil)
    }

    AsyncFunction("deleteMapPoint") { (id: String, promise: Promise) in
      self.mapPoints.removeAll { ($0["id"] as? String) == id }
      self.saveAppData()
      promise.resolve(nil)
    }

    AsyncFunction("getSettings") { (promise: Promise) in
      promise.resolve(Self.loadSettings())
    }

    AsyncFunction("updateSetting") { (key: String, jsonValue: String?, promise: Promise) in
      var settings = VescBleModule.loadSettings()
      if let jsonStr = jsonValue,
         let data = jsonStr.data(using: .utf8),
         let decoded = try? JSONSerialization.jsonObject(with: data, options: .allowFragments) {
        if key == "liveHistoryLimit" {
          guard let minutes = Self.liveHistoryLimitMinutes(decoded) else {
            promise.resolve(nil)
            return
          }
          settings[key] = minutes
        } else {
          settings[key] = decoded
        }
      } else {
        settings.removeValue(forKey: key)
      }
      VescBleModule.saveSettings(settings)
      promise.resolve(nil)
    }
  }

  // MARK: - Scan

  private func stopScan() {
    DispatchQueue.main.async { [weak self] in
      self?.scanTimer?.invalidate()
      self?.scanTimer = nil
    }
  }

  // MARK: - Location

  private func stopLocation() {
    DispatchQueue.main.async { [weak self] in
      self?.locationTimer?.invalidate()
      self?.locationTimer = nil
    }
  }

  // MARK: - Telemetry

  private func stopNativeSession() {
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
        "connectionSeq": sessionGeneration,
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

  private func emitUnsupported(_ operation: String, _ message: String) {
    sendEvent("onError", ["operation": operation, "message": message])
  }

  private func saveAppData() {
    Self.saveArray(boards, key: "vesc_ble_boards")
    Self.saveArray(alertRules, key: "vesc_ble_alert_rules")
    Self.saveArray(privacyZones, key: "vesc_ble_privacy_zones")
    Self.saveArray(mapPoints, key: "vesc_ble_map_points")
  }

  private func upsert(_ array: inout [[String: Any?]], item: [String: Any?]) {
    let normalized = item
    guard let id = normalized["id"] as? String else { return }
    if let index = array.firstIndex(where: { ($0["id"] as? String) == id }) {
      array[index] = normalized
    } else {
      array.append(normalized)
    }
  }

  private static func normalizeBoard(_ raw: [String: Any?]) -> [String: Any?] {
    var board = raw
    board.removeValue(forKey: "minVoltage")
    board.removeValue(forKey: "maxVoltage")
    board["batteryConfig"] = normalizeBatteryConfig(raw["batteryConfig"])
    return board
  }

  private static func normalizeBatteryConfig(_ raw: Any?) -> [String: Any]? {
    guard let config = raw as? [String: Any], let mode = config["mode"] as? String else {
      return nil
    }
    switch mode {
    case "preset":
      guard
        let cellPresetId = config["cellPresetId"] as? String,
        !cellPresetId.isEmpty,
        let seriesCount = intValue(config["seriesCount"]),
        let parallelCount = intValue(config["parallelCount"]),
        seriesCount > 0,
        parallelCount > 0
      else {
        return nil
      }
      return [
        "mode": "preset",
        "cellPresetId": cellPresetId,
        "seriesCount": seriesCount,
        "parallelCount": parallelCount,
      ]
    case "manual":
      guard
        let minVoltage = doubleValue(config["minVoltage"]),
        let maxVoltage = doubleValue(config["maxVoltage"]),
        minVoltage.isFinite,
        maxVoltage.isFinite,
        maxVoltage > minVoltage
      else {
        return nil
      }
      return [
        "mode": "manual",
        "minVoltage": minVoltage,
        "maxVoltage": maxVoltage,
      ]
    default:
      return nil
    }
  }

  private static func intValue(_ raw: Any?) -> Int? {
    if let value = raw as? Int { return value }
    if let value = raw as? NSNumber { return value.intValue }
    return nil
  }

  private static func doubleValue(_ raw: Any?) -> Double? {
    if let value = raw as? Double { return value }
    if let value = raw as? NSNumber { return value.doubleValue }
    return nil
  }

  private static func sortBoards(_ lhs: [String: Any?], _ rhs: [String: Any?]) -> Bool {
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
    "companionPresenceEnabled": false,
    "selectedBoardId": NSNull(),
    "riderId": NSNull(),
    "riderName": NSNull(),
    "riderColor": NSNull(),
    "lastGpsLatitude": NSNull(),
    "lastGpsLongitude": NSNull(),
    "movingSpeedThresholdKmh": 3,
    "telemetryPollRateHz": 20,
    "historyMetricGradientsEnabled": true,
    "historyMetricHotRanges": [
      "speed": ["start": 30, "end": 40],
      "duty": ["start": 60, "end": 80],
      "tempMotor": ["start": 70, "end": 90],
      "tempController": ["start": 60, "end": 80],
      "motorCurrent": ["start": 35, "end": 55],
      "batteryCurrent": ["start": 25, "end": 45],
    ],
  ]

  private static func liveHistoryLimitMinutes(_ value: Any?) -> Int? {
    if let value = value as? Int {
      return min(50, max(1, value))
    }
    if let value = value as? NSNumber {
      return min(50, max(1, value.intValue))
    }
    return nil
  }

  private static func normalizeSettings(_ settings: [String: Any]) -> [String: Any] {
    var normalized = settings
    normalized["liveHistoryLimit"] =
      liveHistoryLimitMinutes(settings["liveHistoryLimit"]) ?? defaultSettings["liveHistoryLimit"]
    return normalized
  }

  private static func loadSettings() -> [String: Any] {
    guard
      let data = UserDefaults.standard.data(forKey: "vesc_ble_settings"),
      let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return defaultSettings
    }
    var merged = defaultSettings
    for (k, v) in raw { merged[k] = v }
    if raw["movingSpeedThresholdKmh"] == nil {
      if let oldValue = raw["avgSpeedCutoffKmh"] ?? raw["movingAvgSpeedThresholdKmh"] {
        merged["movingSpeedThresholdKmh"] = oldValue
      }
    }
    return normalizeSettings(merged)
  }

  private static func saveSettings(_ settings: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: settings) else { return }
    UserDefaults.standard.set(data, forKey: "vesc_ble_settings")
  }

  private static func emptyProfileStats() -> [String: Any?] {
    [
      "distanceM": nil,
      "rideCount": 0,
      "rideTimeMs": 0,
      "topSpeedKmh": 0,
      "avgSpeedKmh": 0,
      "longestRideM": nil,
      "batteryUsedWh": nil,
      "batteryRegenWh": nil,
    ]
  }
}
