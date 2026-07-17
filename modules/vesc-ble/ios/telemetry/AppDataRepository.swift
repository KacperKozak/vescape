import Foundation
import GRDB

/// CRUD over the single GRDB database for app data: boards (with Board Link), alert rules, privacy
/// zones, map points and key-value settings. Values cross the bridge as `[String: Any?]` bags to
/// mirror the JS contract; persistence uses the same column/table shapes as Android Room.
///
/// A Board Link is whole-or-nothing: it is composed only when a board has both a `ble_id` and a
/// proven `transport`, and decomposed back into those two persisted columns on upsert. A partial
/// `ble_id`-without-transport row reads as unlinked (`link == nil`).
///
/// Scope of an `onAppDataChanged` emit; mirrors the JS `AppDataChangedEvent['scope']` union.
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/AppDataRepository.kt `AppDataScope`
enum AppDataScope: String {
  case boards
  case settings
}

/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/AppDataRepository.kt
final class AppDataRepository {
  static let shared = AppDataRepository()

  /// JS-sync hook, wired by `VescBleModule` on create. Called with a scope wire string after every
  /// persisting write so the matching JS store reloads live. Mirrors Android's
  /// `VescForegroundService.emitEvent` static — a module-owned emit the repo funnels through.
  static var onDataChanged: ((String) -> Void)?

  private var pool: DatabasePool? { TelemetryDatabase.pool }

  private init() {}

  /// Notify JS that persisted data in [scope] changed, so the matching store reloads and stays in
  /// sync without an app restart. Every mutating method below funnels through here — new writes get
  /// sync for free by tagging the right scope. Idempotent on the JS side, so emitting after a
  /// JS-initiated write is harmless (the reload just confirms native truth).
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/AppDataRepository.kt `notifyDataChanged`
  private func notifyDataChanged(_ scope: AppDataScope) {
    Self.onDataChanged?(scope.rawValue)
  }

  private func read<T>(_ fallback: T, _ body: (Database) throws -> T) -> T {
    guard let pool else { return fallback }
    return (try? pool.read(body)) ?? fallback
  }

  private func write(_ body: @escaping (Database) throws -> Void) {
    guard let pool else { return }
    try? pool.write(body)
  }

  private func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

  // MARK: - Boards

  func getBoards() -> [[String: Any?]] {
    read([]) { db in
      let boards = try Row.fetchAll(
        db,
        sql: "SELECT id, name, ble_id, transport, created_at FROM boards ORDER BY created_at ASC"
      )
      let settings = try Row.fetchAll(db, sql: "SELECT board_id, key, value_json FROM board_settings")
      var byBoard: [String: [(String, String)]] = [:]
      for row in settings {
        let boardId: String = row["board_id"]
        byBoard[boardId, default: []].append((row["key"], row["value_json"]))
      }
      return boards.map { Self.composeBoard($0, settings: byBoard[$0["id"]] ?? []) }
    }
  }

  func getBoard(_ id: String) -> [String: Any?]? {
    read(nil) { db in
      guard let board = try Row.fetchOne(
        db,
        sql: "SELECT id, name, ble_id, transport, created_at FROM boards WHERE id = ? LIMIT 1",
        arguments: [id]
      ) else { return nil }
      let settings = try Row.fetchAll(
        db,
        sql: "SELECT key, value_json FROM board_settings WHERE board_id = ?",
        arguments: [id]
      ).map { ($0["key"] as String, $0["value_json"] as String) }
      return Self.composeBoard(board, settings: settings)
    }
  }

  func upsertBoard(_ board: [String: Any?]) {
    guard let id = board["id"] as? String else { return }
    let name = board["name"] as? String ?? ""
    let createdAt = Self.longValue(board["createdAt"] ?? nil) ?? nowMs()
    let link = BoardLinkPersistence.normalized(board["link"] ?? nil)
    let bleId = link?["bleId"] as? String
    let linkSettings = BoardLinkPersistence.settings(from: board["link"] ?? nil)

    // Other board-scoped settings. `nil` means the setting row is removed.
    let settings: [(String, Any?)] = [
      ("description", (board["description"] as? String).flatMap { $0.isEmpty ? nil : $0 }),
      ("batteryConfig", Self.normalizeBatteryConfig(board["batteryConfig"] ?? nil)),
      ("dismissedWarnings", Self.normalizeDismissedWarnings(board["dismissedWarnings"] ?? nil)),
    ] + linkSettings.filter { $0.0 != "transport" }
    let transport = linkSettings.first { $0.0 == "transport" }?.1 as? String
    let updatedAt = nowMs()

    write { db in
      try db.execute(
        sql: "INSERT OR REPLACE INTO boards (id, name, ble_id, transport, created_at) VALUES (?, ?, ?, ?, ?)",
        arguments: [id, name, bleId, transport, createdAt]
      )
      for (key, value) in settings {
        guard let value, let json = Self.encodeJson(value) else {
          try db.execute(sql: "DELETE FROM board_settings WHERE board_id = ? AND key = ?", arguments: [id, key])
          continue
        }
        try db.execute(
          sql: "INSERT OR REPLACE INTO board_settings (board_id, key, value_json, updated_at) VALUES (?, ?, ?, ?)",
          arguments: [id, key, json, updatedAt]
        )
      }
    }
    notifyDataChanged(.boards)
  }

  func deleteBoard(_ id: String) {
    write { db in
      try db.execute(sql: "DELETE FROM board_settings WHERE board_id = ?", arguments: [id])
      try db.execute(sql: "DELETE FROM boards WHERE id = ?", arguments: [id])
    }
    notifyDataChanged(.boards)
  }

  /// Persist the last Battery SoC Estimate per board so it survives full app kill (#152). Written as
  /// the `lastBattery` board setting; `upsertBoard` never touches this key, so board edits keep it.
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/AppDataRepository.kt `updateLastBattery`
  func updateLastBattery(boardId: String, percent: Double, voltage: Double?, atMs: Int64) {
    let value: [String: Any] = ["percent": percent, "voltage": voltage ?? NSNull(), "at": atMs]
    guard let json = Self.encodeJson(value) else { return }
    write { db in
      try db.execute(
        sql: "INSERT OR REPLACE INTO board_settings (board_id, key, value_json, updated_at) VALUES (?, ?, ?, ?)",
        arguments: [boardId, "lastBattery", json, atMs]
      )
    }
    notifyDataChanged(.boards)
  }

  private static func composeBoard(_ row: Row, settings: [(String, String)]) -> [String: Any?] {
    var values: [String: Any] = [:]
    for (key, json) in settings {
      if let decoded = decodeBoardSetting(key: key, json: json) { values[key] = decoded }
    }
    let bleId: String? = row["ble_id"]
    let storedTransport: String? = row["transport"]
    let link = BoardLinkPersistence.compose(bleId: bleId, storedTransport: storedTransport, values: values)
    return [
      "id": row["id"] as String,
      "name": row["name"] as String,
      "description": values["description"],
      "createdAt": row["created_at"] as Int64,
      "batteryConfig": values["batteryConfig"],
      "lastBattery": values["lastBattery"],
      "dismissedWarnings": values["dismissedWarnings"],
      "link": link,
    ]
  }

  private static func decodeBoardSetting(key: String, json: String) -> Any? {
    guard let raw = decodeJson(json) else { return nil }
    switch key {
    case "description":
      return raw as? String
    case "batteryConfig":
      return normalizeBatteryConfig(raw)
    case "hasBms":
      return raw as? Bool
    case "linkVersion":
      return intValue(raw)
    case "vescFirmwareVersion", "refloatVersion", "refloatBaseVersion":
      return raw as? String
    case "lastBattery":
      return decodeLastBattery(raw)
    case "dismissedWarnings":
      return normalizeDismissedWarnings(raw)
    default:
      return nil
    }
  }

  /// Dismissed Board Warning kinds persisted as a board setting: a non-empty array of kind slugs, or
  /// nil (row removed) when empty/invalid.
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/AppDataRepository.kt `normalizeDismissedWarnings`
  private static func normalizeDismissedWarnings(_ raw: Any?) -> [String]? {
    guard let list = raw as? [Any] else { return nil }
    let kinds = list.compactMap { $0 as? String }.filter { !$0.isEmpty }
    return kinds.isEmpty ? nil : kinds
  }

  private static func decodeLastBattery(_ raw: Any?) -> [String: Any?]? {
    guard
      let map = raw as? [String: Any],
      let percent = doubleValue(map["percent"]),
      let at = longValue(map["at"])
    else { return nil }
    return ["percent": percent, "voltage": doubleValue(map["voltage"]), "at": at]
  }

  // MARK: - Alert rules

  func getAlertRules() -> [[String: Any?]] {
    read([]) { db in
      try Row.fetchAll(db, sql: "SELECT * FROM alerts ORDER BY created_at ASC").map { row in
        [
          "id": row["id"] as String,
          "controlId": row["control_id"] as String,
          "threshold": row["threshold"] as Double,
          "thresholdMax": row["threshold_max"] as Double?,
          "enabled": (row["enabled"] as Int64) != 0,
          "soundType": row["sound_type"] as String,
          "createdAt": row["created_at"] as Int64,
        ]
      }
    }
  }

  /// Enabled rules materialized as `AlertRule` for the alert engine. Mirrors Android
  /// `AppDataRepository.getEnabledAlertRuleEntities`.
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/AppDataRepository.kt `getEnabledAlertRuleEntities`
  func getEnabledAlertRules() -> [AlertRule] {
    read([]) { db in
      try Row.fetchAll(
        db,
        sql: "SELECT * FROM alerts WHERE enabled = 1 ORDER BY created_at ASC"
      ).map { row in
        AlertRule(
          id: row["id"] as String,
          controlId: row["control_id"] as String,
          threshold: row["threshold"] as Double,
          thresholdMax: row["threshold_max"] as Double?,
          enabled: (row["enabled"] as Int64) != 0,
          soundType: row["sound_type"] as String,
          createdAt: row["created_at"] as Int64
        )
      }
    }
  }

  func upsertAlertRule(_ rule: [String: Any?]) {
    guard let id = rule["id"] as? String, let controlId = rule["controlId"] as? String else { return }
    let threshold = Self.doubleValue(rule["threshold"] ?? nil) ?? 0
    let thresholdMax = Self.doubleValue(rule["thresholdMax"] ?? nil)
    let enabled = (rule["enabled"] as? Bool) ?? false
    let soundType = rule["soundType"] as? String ?? "default"
    let createdAt = Self.longValue(rule["createdAt"] ?? nil) ?? nowMs()
    write { db in
      try db.execute(
        sql: """
          INSERT OR REPLACE INTO alerts (id, control_id, threshold, threshold_max, enabled, sound_type, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          """,
        arguments: [id, controlId, threshold, thresholdMax, enabled ? 1 : 0, soundType, createdAt]
      )
    }
  }

  func setAlertRuleEnabled(_ id: String, _ enabled: Bool) {
    write { db in
      try db.execute(sql: "UPDATE alerts SET enabled = ? WHERE id = ?", arguments: [enabled ? 1 : 0, id])
    }
  }

  func deleteAlertRule(_ id: String) {
    write { db in try db.execute(sql: "DELETE FROM alerts WHERE id = ?", arguments: [id]) }
  }

  // MARK: - Privacy zones

  func getPrivacyZones() -> [[String: Any?]] {
    read([]) { db in
      try Row.fetchAll(db, sql: "SELECT * FROM privacy_zones ORDER BY created_at ASC").map { row in
        [
          "id": row["id"] as String,
          "preset": row["preset"] as String,
          "name": row["name"] as String,
          "enabled": (row["enabled"] as Int64) != 0,
          "centerLatitude": (row["center_latitude_e7"] as Int64).asE7Degrees,
          "centerLongitude": (row["center_longitude_e7"] as Int64).asE7Degrees,
          "radiusMeters": row["radius_meters"] as Int64,
          "createdAt": row["created_at"] as Int64,
          "updatedAt": row["updated_at"] as Int64,
        ]
      }
    }
  }

  func upsertPrivacyZone(_ zone: [String: Any?]) {
    guard
      let id = zone["id"] as? String,
      let name = zone["name"] as? String,
      let latitude = Self.doubleValue(zone["centerLatitude"] ?? nil),
      let longitude = Self.doubleValue(zone["centerLongitude"] ?? nil),
      let radius = Self.longValue(zone["radiusMeters"] ?? nil)
    else { return }
    let preset = zone["preset"] as? String ?? "custom"
    let enabled = (zone["enabled"] as? Bool) ?? false
    let now = nowMs()
    let createdAt = Self.longValue(zone["createdAt"] ?? nil) ?? now
    let updatedAt = Self.longValue(zone["updatedAt"] ?? nil) ?? now
    write { db in
      try db.execute(
        sql: """
          INSERT OR REPLACE INTO privacy_zones
            (id, preset, name, enabled, center_latitude_e7, center_longitude_e7, radius_meters, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
        arguments: [id, preset, name, enabled ? 1 : 0, latitude.toE7, longitude.toE7, radius, createdAt, updatedAt]
      )
    }
  }

  func setPrivacyZoneEnabled(_ id: String, _ enabled: Bool) {
    let updatedAt = nowMs()
    write { db in
      try db.execute(
        sql: "UPDATE privacy_zones SET enabled = ?, updated_at = ? WHERE id = ?",
        arguments: [enabled ? 1 : 0, updatedAt, id]
      )
    }
  }

  func deletePrivacyZone(_ id: String) {
    write { db in try db.execute(sql: "DELETE FROM privacy_zones WHERE id = ?", arguments: [id]) }
  }

  // MARK: - Map points

  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/AppDataRepository.kt `VALID_MAP_POINT_KINDS`
  /// @parity /modules/vesc-ble/src/index.ts `MapPointKind`
  private static let validMapPointKinds: Set<String> = [
    "direction", "drop", "bonk", "nose_slide", "trail_entry", "viewpoint", "charging", "charging_food",
  ]

  func getMapPoints() -> [[String: Any?]] {
    read([]) { db in
      try Row.fetchAll(db, sql: "SELECT * FROM map_points ORDER BY created_at ASC").map { row in
        [
          "id": row["id"] as String,
          "kind": row["kind"] as String,
          "latitude": (row["latitude_e7"] as Int64).asE7Degrees,
          "longitude": (row["longitude_e7"] as Int64).asE7Degrees,
          "createdAt": row["created_at"] as Int64,
          "updatedAt": row["updated_at"] as Int64,
        ]
      }
    }
  }

  func upsertMapPoint(_ point: [String: Any?]) {
    guard let entity = Self.mapPointColumns(point) else { return }
    write { db in try Self.insertMapPoint(db, entity) }
  }

  func replaceDirectionMapPoint(_ point: [String: Any?]) {
    var forced = point
    forced["kind"] = "direction"
    guard let entity = Self.mapPointColumns(forced) else { return }
    write { db in
      try db.execute(sql: "DELETE FROM map_points WHERE kind = 'direction'")
      try Self.insertMapPoint(db, entity)
    }
  }

  func deleteMapPoint(_ id: String) {
    write { db in try db.execute(sql: "DELETE FROM map_points WHERE id = ?", arguments: [id]) }
  }

  private static func insertMapPoint(_ db: Database, _ c: (String, String, Int64, Int64, Int64, Int64)) throws {
    try db.execute(
      sql: """
        INSERT OR REPLACE INTO map_points (id, kind, latitude_e7, longitude_e7, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
      arguments: [c.0, c.1, c.2, c.3, c.4, c.5]
    )
  }

  private static func mapPointColumns(
    _ point: [String: Any?]
  ) -> (String, String, Int64, Int64, Int64, Int64)? {
    guard
      let id = point["id"] as? String,
      let kind = (point["kind"] as? String), validMapPointKinds.contains(kind),
      let latitude = doubleValue(point["latitude"] ?? nil), latitude.isFinite,
      let longitude = doubleValue(point["longitude"] ?? nil), longitude.isFinite
    else { return nil }
    let now = Int64(Date().timeIntervalSince1970 * 1000)
    let createdAt = longValue(point["createdAt"] ?? nil) ?? now
    let updatedAt = longValue(point["updatedAt"] ?? nil) ?? now
    return (id, kind, latitude.toE7, longitude.toE7, createdAt, updatedAt)
  }

  // MARK: - Settings

  func getSettings() -> [String: Any?] {
    let rows: [String: Any] = read([:]) { db in
      var stored: [String: Any] = [:]
      for row in try Row.fetchAll(db, sql: "SELECT key, value_json FROM app_settings") {
        if let decoded = Self.decodeJson(row["value_json"]) { stored[row["key"]] = decoded }
      }
      return stored
    }
    var merged = Self.defaultSettings
    for (key, value) in rows { merged[key] = value }
    if merged["movingSpeedThresholdKmh"] == nil {
      if let legacy = rows["avgSpeedCutoffKmh"] ?? rows["movingAvgSpeedThresholdKmh"] {
        merged["movingSpeedThresholdKmh"] = legacy
      }
    }
    return Self.normalizeSettings(merged)
  }

  func updateSetting(_ key: String, rawValue: Any?) {
    let updatedAt = nowMs()
    guard let rawValue, !(rawValue is NSNull) else {
      write { db in try db.execute(sql: "DELETE FROM app_settings WHERE key = ?", arguments: [key]) }
      notifyDataChanged(.settings)
      return
    }
    let value: Any
    if key == "liveHistoryLimit" {
      guard let minutes = Self.liveHistoryLimitMinutes(rawValue) else { return }
      value = minutes
    } else if key == "boardWarningsEnabled" {
      // Kill switch must stay a strict Bool (Android rejects non-Boolean too) so JS state and the
      // native detector gate can never diverge on a malformed value.
      guard let enabled = rawValue as? Bool else { return }
      value = enabled
    } else {
      value = rawValue
    }
    guard let json = Self.encodeJson(value) else { return }
    write { db in
      try db.execute(
        sql: "INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)",
        arguments: [key, json, updatedAt]
      )
    }
    notifyDataChanged(.settings)
  }

  // MARK: - Shared pure helpers (also used by VescBleModule bridge glue)

  static let defaultSettings: [String: Any] = [
    "liveHistoryLimit": 5,
    "autoConnect": true,
    "autoRecording": false,
    "companionPresenceEnabled": false,
    "boardWarningsEnabled": true,
    "companionPresenceCooldownMinutes": 60,
    // @platform-diff Auto close is Android-only behavior (iOS forbids programmatic app exit);
    // the keys exist here only so getSettings() returns the full settings shape.
    "autoCloseEnabled": false,
    "autoCloseDelayMinutes": 15,
    "selectedBoardId": NSNull(),
    "riderId": NSNull(),
    "riderName": NSNull(),
    "riderColor": NSNull(),
    "lastGpsLatitude": NSNull(),
    "lastGpsLongitude": NSNull(),
    "movingSpeedThresholdKmh": 3,
    "freeSpinMaxSpeedDeltaKmh": DEFAULT_FREE_SPIN_MAX_SPEED_DELTA_KMH,
    "freeSpinStationaryBoardCapKmh": DEFAULT_FREE_SPIN_STATIONARY_BOARD_CAP_KMH,
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

  static func normalizeSettings(_ settings: [String: Any]) -> [String: Any] {
    var normalized = settings
    normalized["liveHistoryLimit"] =
      liveHistoryLimitMinutes(settings["liveHistoryLimit"]) ?? defaultSettings["liveHistoryLimit"]
    return normalized
  }

  static func liveHistoryLimitMinutes(_ value: Any?) -> Int? {
    guard let minutes = intValue(value) else { return nil }
    return min(50, max(1, minutes))
  }

  static func normalizeBatteryConfig(_ raw: Any?) -> [String: Any]? {
    guard let config = raw as? [String: Any], let mode = config["mode"] as? String else { return nil }
    switch mode {
    case "preset":
      guard
        let cellPresetId = config["cellPresetId"] as? String, !cellPresetId.isEmpty,
        let seriesCount = intValue(config["seriesCount"]), seriesCount > 0,
        let parallelCount = intValue(config["parallelCount"]), parallelCount > 0
      else { return nil }
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
        minVoltage.isFinite, maxVoltage.isFinite, maxVoltage > minVoltage
      else { return nil }
      return ["mode": "manual", "minVoltage": minVoltage, "maxVoltage": maxVoltage]
    default:
      return nil
    }
  }

  static func intValue(_ raw: Any?) -> Int? {
    if let value = raw as? Int { return value }
    if let value = raw as? NSNumber { return value.intValue }
    return nil
  }

  static func doubleValue(_ raw: Any?) -> Double? {
    if let value = raw as? Double { return value }
    if let value = raw as? NSNumber { return value.doubleValue }
    return nil
  }

  static func longValue(_ raw: Any?) -> Int64? {
    if let value = raw as? Int64 { return value }
    if let value = raw as? Int { return Int64(value) }
    if let value = raw as? NSNumber { return value.int64Value }
    return nil
  }

  private static func encodeJson(_ value: Any?) -> String? {
    guard let value, !(value is NSNull) else { return nil }
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]) else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }

  private static func decodeJson(_ text: String) -> Any? {
    guard
      let data = text.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    else { return nil }
    return object is NSNull ? nil : object
  }
}

private extension Int64 {
  /// Convert an e7-scaled integer coordinate to decimal degrees.
  var asE7Degrees: Double { Double(self) / 10_000_000.0 }
}

private extension Double {
  /// Convert decimal degrees to an e7-scaled integer coordinate.
  var toE7: Int64 { Int64(self * 10_000_000.0) }
}
