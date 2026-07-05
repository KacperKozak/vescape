import ExpoModulesCore
import Foundation
import GRDB

/// Single on-device database for iOS. One GRDB file backs both app data (boards, alert rules,
/// privacy zones, map points, settings) and telemetry tables — mirroring the single Android Room
/// database. GRDB `DatabasePool` opens in WAL mode by default, matching Room's WAL concurrency.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryDatabase.kt
/// @platform-diff iOS is greenfield, so the schema starts at a single `v1` migration that creates
/// the final table shapes directly instead of replaying Android's incremental Room migrations. The
/// telemetry tables are created schema-only here; their writers land in later slices (#60/#61/#63).
enum TelemetryDatabase {
  private static let databaseName = "telemetry.db"

  /// Pool installed by a database restore, replacing the originally opened `poolResult`. Callers
  /// read `pool` on every access, so a swap is picked up transparently across the app.
  private static var reopened: DatabasePool?

  private static let poolResult: Result<DatabasePool, Error> = {
    do {
      guard let url = databaseURL else { throw CocoaError(.fileNoSuchFile) }
      let pool = try DatabasePool(path: url.path)
      try migrator.migrate(pool)
      return .success(pool)
    } catch {
      return .failure(error)
    }
  }()

  /// The shared pool, or `nil` if the database could not be opened. Callers degrade gracefully
  /// (reads return empty, writes no-op) rather than crashing the bridge.
  static var pool: DatabasePool? {
    if let reopened { return reopened }
    if case let .success(pool) = poolResult { return pool }
    return nil
  }

  /// On-disk location of the single database file.
  static var databaseURL: URL? {
    guard let support = try? FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    ) else { return nil }
    return support.appendingPathComponent(databaseName)
  }

  /// Size of the live database file in bytes, or 0 when it does not exist yet.
  static var databaseSizeBytes: Int64 {
    guard let path = databaseURL?.path,
          let attrs = try? FileManager.default.attributesOfItem(atPath: path),
          let size = attrs[.size] as? NSNumber else { return 0 }
    return size.int64Value
  }

  /// Hot-swap the database file with a validated restore, closing the live pool so SQLite releases
  /// the file + WAL sidecars, then reopening (and migrating) at the same path. On any failure the
  /// previous file is rolled back so the app is never left without a database.
  static func replaceDatabase(withFileAt source: URL) throws {
    guard let target = databaseURL else { throw CocoaError(.fileNoSuchFile) }
    let fm = FileManager.default
    let sidecarSuffixes = ["", "-wal", "-shm"]

    if let reopened { try? reopened.close() }
    else if case let .success(pool) = poolResult { try? pool.close() }

    let rollbackDir = fm.temporaryDirectory.appendingPathComponent("db-rollback-\(UUID().uuidString)", isDirectory: true)
    try fm.createDirectory(at: rollbackDir, withIntermediateDirectories: true)
    defer { try? fm.removeItem(at: rollbackDir) }

    var moved: [(original: URL, saved: URL)] = []
    for suffix in sidecarSuffixes {
      let file = URL(fileURLWithPath: target.path + suffix)
      guard fm.fileExists(atPath: file.path) else { continue }
      let saved = rollbackDir.appendingPathComponent(target.lastPathComponent + suffix)
      try fm.moveItem(at: file, to: saved)
      moved.append((file, saved))
    }

    do {
      try fm.copyItem(at: source, to: target)
      let pool = try DatabasePool(path: target.path)
      try migrator.migrate(pool)
      try pool.read { db in _ = try Int.fetchOne(db, sql: "SELECT 1") }
      reopened = pool
    } catch {
      for suffix in sidecarSuffixes { try? fm.removeItem(at: URL(fileURLWithPath: target.path + suffix)) }
      for entry in moved { try? fm.moveItem(at: entry.saved, to: entry.original) }
      reopened = try? DatabasePool(path: target.path)
      throw error
    }
  }

  private static var migrator: DatabaseMigrator {
    var migrator = DatabaseMigrator()

    migrator.registerMigration("v1") { db in
      // MARK: App data

      try db.execute(sql: """
        CREATE TABLE boards (
          id TEXT NOT NULL PRIMARY KEY,
          name TEXT NOT NULL,
          ble_id TEXT,
          transport TEXT,
          created_at INTEGER NOT NULL
        )
        """)
      try db.execute(sql: "CREATE INDEX index_boards_created_at ON boards(created_at)")

      try db.execute(sql: """
        CREATE TABLE board_settings (
          board_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (board_id, key)
        )
        """)
      try db.execute(sql: "CREATE INDEX index_board_settings_board_id ON board_settings(board_id)")

      try db.execute(sql: """
        CREATE TABLE alerts (
          id TEXT NOT NULL PRIMARY KEY,
          control_id TEXT NOT NULL,
          threshold REAL NOT NULL,
          threshold_max REAL,
          enabled INTEGER NOT NULL,
          sound_type TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
        """)
      try db.execute(sql: "CREATE INDEX index_alerts_control_id ON alerts(control_id)")
      try db.execute(sql: "CREATE INDEX index_alerts_enabled ON alerts(enabled)")
      try db.execute(sql: "CREATE INDEX index_alerts_created_at ON alerts(created_at)")

      try db.execute(sql: """
        CREATE TABLE privacy_zones (
          id TEXT NOT NULL PRIMARY KEY,
          preset TEXT NOT NULL,
          name TEXT NOT NULL,
          enabled INTEGER NOT NULL,
          center_latitude_e7 INTEGER NOT NULL,
          center_longitude_e7 INTEGER NOT NULL,
          radius_meters INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
        """)

      try db.execute(sql: """
        CREATE TABLE map_points (
          id TEXT NOT NULL PRIMARY KEY,
          kind TEXT NOT NULL,
          latitude_e7 INTEGER NOT NULL,
          longitude_e7 INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
        """)
      try db.execute(sql: "CREATE INDEX index_map_points_kind ON map_points(kind)")

      try db.execute(sql: """
        CREATE TABLE app_settings (
          key TEXT NOT NULL PRIMARY KEY,
          value_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
        """)

      // MARK: Telemetry (schema only — populated by #60/#61/#63)

      try db.execute(sql: """
        CREATE TABLE telemetry_frames (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          captured_at_ms INTEGER NOT NULL,
          elapsed_realtime_ms INTEGER NOT NULL,
          device_id TEXT,
          device_name TEXT,
          can_id INTEGER,
          flags INTEGER NOT NULL,
          changed_mask_1 INTEGER NOT NULL,
          changed_mask_2 INTEGER NOT NULL,
          speed_centi_kmh INTEGER,
          battery_voltage_mv INTEGER,
          motor_current_ma INTEGER,
          battery_current_ma INTEGER,
          duty_permille INTEGER,
          pitch_centi_deg INTEGER,
          roll_centi_deg INTEGER,
          balance_pitch_centi_deg INTEGER,
          balance_current_ma INTEGER,
          erpm INTEGER,
          state INTEGER,
          switch_state INTEGER,
          adc1_milli INTEGER,
          adc2_milli INTEGER,
          odometer_cm INTEGER,
          temp_mosfet_deci_c INTEGER,
          temp_motor_deci_c INTEGER,
          fault_code INTEGER,
          latitude_e7 INTEGER,
          longitude_e7 INTEGER,
          gps_speed_centi_mps INTEGER,
          bearing_centi_deg INTEGER,
          accuracy_cm INTEGER,
          altitude_cm INTEGER,
          location_timestamp_ms INTEGER
        )
        """)
      try db.execute(sql: "CREATE INDEX index_telemetry_frames_captured_at_ms ON telemetry_frames(captured_at_ms)")
      try db.execute(sql: """
        CREATE INDEX index_telemetry_frames_device_id_captured_at_ms
        ON telemetry_frames(device_id, captured_at_ms)
        """)
      try db.execute(sql: """
        CREATE INDEX index_telemetry_frames_fault
        ON telemetry_frames(captured_at_ms)
        WHERE fault_code IS NOT NULL AND fault_code != 0
        """)

      try db.execute(sql: """
        CREATE TABLE telemetry_minute_buckets (
          bucket_start_ms INTEGER NOT NULL,
          device_id TEXT NOT NULL,
          device_name TEXT,
          sample_count INTEGER NOT NULL,
          first_sample_at_ms INTEGER NOT NULL,
          last_sample_at_ms INTEGER NOT NULL,
          sum_abs_speed_centi_kmh INTEGER NOT NULL,
          moving_speed_sample_count INTEGER,
          sum_moving_abs_speed_centi_kmh INTEGER,
          max_abs_speed_centi_kmh INTEGER NOT NULL,
          min_battery_voltage_mv INTEGER,
          max_motor_current_abs_ma INTEGER NOT NULL,
          max_battery_current_abs_ma INTEGER NOT NULL,
          battery_used_wh_milli INTEGER NOT NULL,
          battery_regen_wh_milli INTEGER NOT NULL,
          max_duty_abs_permille INTEGER NOT NULL,
          fault_count INTEGER NOT NULL,
          first_odometer_cm INTEGER,
          last_odometer_cm INTEGER,
          gps_point_count INTEGER NOT NULL,
          precise_gps_point_count INTEGER NOT NULL,
          gps_distance_cm INTEGER NOT NULL,
          max_gps_speed_centi_mps INTEGER,
          max_temp_mosfet_deci_c INTEGER,
          max_temp_motor_deci_c INTEGER,
          first_latitude_e7 INTEGER,
          first_longitude_e7 INTEGER,
          first_moving_at_ms INTEGER,
          last_moving_at_ms INTEGER,
          PRIMARY KEY (bucket_start_ms, device_id)
        )
        """)
      try db.execute(sql: "CREATE INDEX index_telemetry_minute_buckets_bucket_start_ms ON telemetry_minute_buckets(bucket_start_ms)")

      try db.execute(sql: """
        CREATE TABLE telemetry_markers (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          occurred_at_ms INTEGER NOT NULL,
          elapsed_realtime_ms INTEGER NOT NULL,
          type TEXT NOT NULL,
          device_id TEXT,
          device_name TEXT,
          message TEXT,
          gap_ms INTEGER
        )
        """)
      try db.execute(sql: "CREATE INDEX index_telemetry_markers_occurred_at_ms ON telemetry_markers(occurred_at_ms)")
      try db.execute(sql: """
        CREATE INDEX index_telemetry_markers_device_id_occurred_at_ms
        ON telemetry_markers(device_id, occurred_at_ms)
        """)

      try db.execute(sql: """
        CREATE TABLE metric_exclusion_ranges (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          device_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          start_ms INTEGER NOT NULL,
          end_ms INTEGER NOT NULL,
          sample_count INTEGER NOT NULL
        )
        """)
      try db.execute(sql: """
        CREATE INDEX index_metric_exclusion_ranges_start_ms_end_ms
        ON metric_exclusion_ranges(start_ms, end_ms)
        """)
      try db.execute(sql: """
        CREATE INDEX index_metric_exclusion_ranges_device_id_start_ms_end_ms
        ON metric_exclusion_ranges(device_id, start_ms, end_ms)
        """)

      try db.execute(sql: """
        CREATE TABLE diagnostic_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          occurred_at_ms INTEGER NOT NULL,
          elapsed_realtime_ms INTEGER NOT NULL,
          event_name TEXT NOT NULL,
          operation TEXT,
          phase TEXT,
          device_id TEXT,
          device_name TEXT,
          message TEXT,
          properties_json TEXT NOT NULL
        )
        """)
      try db.execute(sql: "CREATE INDEX index_diagnostic_events_occurred_at_ms ON diagnostic_events(occurred_at_ms)")
      try db.execute(sql: "CREATE INDEX index_diagnostic_events_event_name ON diagnostic_events(event_name)")
      try db.execute(sql: """
        CREATE INDEX index_diagnostic_events_device_id_occurred_at_ms
        ON diagnostic_events(device_id, occurred_at_ms)
        """)
    }

    // MARK: Tune Profiles (#161)
    // Per-board VESC tune configs with reversible Tune History. DDL lives on `TuneProfileStore` so
    // the schema stays single-source with the tests that reuse it.
    migrator.registerMigration("v2_tune_profiles") { db in
      try TuneProfileStore.createTables(db)
    }

    return migrator
  }
}

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
    let link = board["link"] as? [String: Any?]
    let bleId = (link?["bleId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    let transport = bleId == nil ? nil : BoardTransport.encode(BoardTransport.fromBridge(link?["transport"] ?? nil))

    // Other board-scoped settings. `nil` means the setting row is removed.
    let settings: [(String, Any?)] = [
      ("description", (board["description"] as? String).flatMap { $0.isEmpty ? nil : $0 }),
      ("batteryConfig", Self.normalizeBatteryConfig(board["batteryConfig"] ?? nil)),
      ("hasBms", link?["hasBms"] as? Bool),
    ]
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
    let transport = BoardTransport.decode(storedTransport)?.bridgeValue
    // A Board Link exists only when both a BLE peripheral and a proven transport are stored.
    var link: [String: Any?]?
    if let bleId, let transport {
      var built: [String: Any?] = ["bleId": bleId, "transport": transport]
      if let hasBms = values["hasBms"] as? Bool { built["hasBms"] = hasBms }
      link = built
    }
    return [
      "id": row["id"] as String,
      "name": row["name"] as String,
      "description": values["description"],
      "createdAt": row["created_at"] as Int64,
      "batteryConfig": values["batteryConfig"],
      "lastBattery": values["lastBattery"],
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
    case "lastBattery":
      return decodeLastBattery(raw)
    default:
      return nil
    }
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

// Thin JS bridge. Board scan/connect/telemetry delegate to the CoreBluetooth stack
// (VescGattClient + ConnectionCoordinator); app data delegates to GRDB, while later iOS
// subsystems still keep bridge-shaped stubs.
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt
/// TODO(iOS parity): port Group Ride, debug recording, and Refloat config subsystems to match
/// Android API/events/errors. Diagnostics/notifications/privacy/backup landed in #63; the
/// `board_probe_*` Diagnostic Events await the Board Probe subsystem (#111).
public class VescBleModule: Module {

  // MARK: - Session state

  private var selectedBoardId: String? = nil

  /// Retains the in-flight Board Probe across its async BLE lifecycle. Only one runs at a time —
  /// the probe owns the single BLE link (see Android `probeBoardLink`).
  private var activeProbe: BoardTransportDetector?

  /// Frontend liveness gate. False while the app is backgrounded so the high-frequency telemetry
  /// firehose (`onLiveTick` at the board's poll rate, `onTelemetryHistory`, `onLiveSeries`) never
  /// crosses to a JS thread iOS keeps alive under the BLE/`location` background modes — that flood
  /// pegged the JS thread and tripped the OS CPU watchdog (fatal `cpu_resource` kill). Native keeps
  /// polling, recording and firing alerts throughout; only the JS-facing emit sleeps.
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt `frontendActive`
  private var frontendActive = true
  /// Events with at least one live JS listener, tracked via `OnStartObserving`/`OnStopObserving`.
  private var observedEvents = Set<String>()

  /// Shared, app-level Board Session owner that outlives this module instance. A JS runtime reload
  /// (dev reload, OTA update, JS crash recovery) tears down this module and builds a fresh one; the
  /// session, recording, GPS and Live Activity keep running on the singleton and the new module
  /// re-attaches its JS sinks in `OnCreate` (see `attachToCoordinator`). Mirrors Android's
  /// process-level `VescForegroundService`, whose session survives module teardown while `OnDestroy`
  /// only detaches the emit sink.
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt
  private let coordinator = ConnectionCoordinator.shared

  // MARK: - App data state

  private let appData = AppDataRepository.shared

  /// Bundled alert presets surfaced to JS through `getAlertPresets`. Mirrors Android
  /// `alertSoundPresetMaps()`.
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescAlerts.kt `alertSoundPresetMaps`
  private let alertPresets: [[String: Any]] = alertSoundPresetMaps()

  // MARK: - Module definition

  public func definition() -> ModuleDefinition {
    Name("VescBle")

    Events("onDevice", "onError", "onLiveState", "onLiveTick", "onLiveSeries", "onTelemetryHistory", "onBms", "onLocation", "onTelemetryRebuildProgress", "onBoardProbeProgress", "onAppDataChanged", "onGroupRideConnection", "onGroupRideSnapshot", "onGroupRideCreated", "onGroupRideUpdated", "onGroupRideEnded", "onGroupRideJoined", "onGroupRideRoster", "onGroupRideError")

    // Track per-event JS listeners so native skips emitting into the void, and gate the whole
    // firehose on app foreground (see `frontendActive`). Mirrors Android's observing + lifecycle
    // gate. @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt
    OnStartObserving("onDevice") { self.observedEvents.insert("onDevice") }
    OnStopObserving("onDevice") { self.observedEvents.remove("onDevice") }
    OnStartObserving("onError") { self.observedEvents.insert("onError") }
    OnStopObserving("onError") { self.observedEvents.remove("onError") }
    OnStartObserving("onLiveState") { self.observedEvents.insert("onLiveState") }
    OnStopObserving("onLiveState") { self.observedEvents.remove("onLiveState") }
    OnStartObserving("onLiveTick") { self.observedEvents.insert("onLiveTick") }
    OnStopObserving("onLiveTick") { self.observedEvents.remove("onLiveTick") }
    OnStartObserving("onLiveSeries") { self.observedEvents.insert("onLiveSeries") }
    OnStopObserving("onLiveSeries") { self.observedEvents.remove("onLiveSeries") }
    OnStartObserving("onTelemetryHistory") { self.observedEvents.insert("onTelemetryHistory") }
    OnStopObserving("onTelemetryHistory") { self.observedEvents.remove("onTelemetryHistory") }
    OnStartObserving("onBms") { self.observedEvents.insert("onBms") }
    OnStopObserving("onBms") { self.observedEvents.remove("onBms") }
    OnStartObserving("onLocation") { self.observedEvents.insert("onLocation") }
    OnStopObserving("onLocation") { self.observedEvents.remove("onLocation") }
    OnStartObserving("onTelemetryRebuildProgress") { self.observedEvents.insert("onTelemetryRebuildProgress") }
    OnStopObserving("onTelemetryRebuildProgress") { self.observedEvents.remove("onTelemetryRebuildProgress") }

    OnCreate {
      self.attachToCoordinator()
      AppDataRepository.onDataChanged = { [weak self] scope in self?.sendAppDataChanged(scope) }
      self.autoConnectSelectedBoard()
    }

    OnAppEntersForeground {
      self.frontendActive = true
    }
    OnAppEntersBackground {
      self.frontendActive = false
    }

    OnDestroy {
      // JS runtime is tearing down (dev reload, OTA update, JS crash recovery). Detach only the
      // JS-facing sinks; the shared coordinator keeps the native Board Session, recording, GPS and
      // Live Activity alive so a fresh module re-attaches to the live session. Must not call
      // `stopBoard()` (see `docs/ios.md`). Mirrors Android nulling `VescForegroundService.emitEvent`.
      // @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt
      self.detachFromCoordinator()
      AppDataRepository.onDataChanged = nil
      self.frontendActive = false
      self.observedEvents.removeAll()
      self.activeProbe = nil
    }

    // MARK: Scan

    Function("scan") {
      self.coordinator.scan()
    }

    Function("stopScan") {
      self.coordinator.stopScan()
    }

    // MARK: Location

    Function("startLocationUpdates") {
      self.coordinator.startLocationUpdates()
    }

    // Flush buffered telemetry after stopping GPS so no pending rows are lost on the way down.
    // @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt `stopLocationUpdates`
    Function("stopLocationUpdates") {
      self.coordinator.stopLocationUpdates()
      TelemetryRepository.shared.flushBlocking()
    }

    // MARK: App lifecycle

    // Android kills its foreground service + process here. iOS has no sanctioned process-kill idiom
    // (App Store rejects `exit()`), so this degrades to a graceful native teardown of all long-lived
    // work; JS never crashes calling it.
    // @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt `exitApp`
    // @platform-diff iOS cannot terminate its own process; graceful shutdown instead of kill.
    Function("exitApp") {
      self.coordinator.stopBoard()
      self.coordinator.stopLocationUpdates()
      self.coordinator.stopScan()
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

    // Latch the request even before connect, silently — the coordinator replays it when a board
    // connects. No error event on the pre-connect path: Android latches without emitting.
    // @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt `setTelemetryRecordingEnabled`
    Function("setTelemetryRecordingEnabled") { (enabled: Bool) in
      _ = self.coordinator.setTelemetryRecordingEnabled(enabled)
    }

    Function("reloadAlertRules") {
      self.coordinator.reloadAlertRules()
    }

    Function("previewAlertSound") { (soundType: String) in
      self.coordinator.previewAlertSound(soundType)
    }

    Function("getAlertPresets") {
      self.alertPresets
    }

    Function("startGeigerSimulation") { (soundType: String, rangeDepth: Double) in
      self.coordinator.startGeigerSimulation(soundType: soundType, rangeDepth: rangeDepth)
    }

    Function("stopGeigerSimulation") {
      self.coordinator.stopGeigerSimulation()
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
      self.appData.updateSetting("selectedBoardId", rawValue: boardId)
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
      self.appData.updateSetting("selectedBoardId", rawValue: boardId)
      guard let config = self.connectConfig(boardId: boardId) else {
        promise.reject("NO_LINK", "Board has no Board Link: \(boardId)")
        return
      }
      self.coordinator.connect(
        config: config,
        onSuccess: { promise.resolve(nil) },
        onError: { code, message in promise.reject(code, message) }
      )
    }

    AsyncFunction("stopBoard") { (promise: Promise) in
      self.coordinator.stopBoard()
      promise.resolve(nil)
    }

    AsyncFunction("probeBoardLink") { (bleId: String, promise: Promise) in
      DispatchQueue.main.async { self.startProbe(bleId: bleId, promise: promise) }
    }

    // MARK: Telemetry history

    AsyncFunction("getTelemetryHistory") { (options: [String: Any], promise: Promise) in
      promise.resolve(TelemetryRepository.shared.getHistory(options))
    }

    AsyncFunction("getTelemetrySamples") { (options: [String: Any], promise: Promise) in
      promise.resolve(TelemetryRepository.shared.getSamples(options))
    }

    AsyncFunction("getHistoryRange") { (options: [String: Any], promise: Promise) in
      promise.resolve(TelemetryRepository.shared.getRange(options))
    }

    Function("reportUiError") { (message: String, source: String?, stack: String?) in
      DiagnosticReporter.shared.reportUiError(message: message, source: source, stack: stack)
    }

    Function("reportDiagnosticTest") { () -> [String: Any?] in
      DiagnosticReporter.shared.reportDiagnosticTest()
    }

    Function("getDiagnosticStatus") { () -> [String: Any?] in
      DiagnosticReporter.shared.status()
    }

    AsyncFunction("getDiagnosticEvents") { (options: [String: Any], promise: Promise) in
      promise.resolve(TelemetryRepository.shared.getDiagnosticEvents(options))
    }

    AsyncFunction("clearDiagnosticEvents") { (promise: Promise) in
      TelemetryRepository.shared.clearDiagnosticEvents()
      promise.resolve(nil)
    }

    AsyncFunction("getTelemetrySummary") { (promise: Promise) in
      promise.resolve(TelemetryRepository.shared.getSummary())
    }

    AsyncFunction("getDatabaseSizeBytes") { () -> Int in
      Int(TelemetryDatabase.databaseSizeBytes)
    }

    AsyncFunction("backupDatabase") { (promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          promise.resolve(try DatabaseBackupManager.createBackup())
        } catch {
          promise.reject("ERR_BACKUP_DATABASE", error.localizedDescription)
        }
      }
    }

    // Stop every writer touching the DB before the file swap: scan, board session (flushes buffered
    // telemetry synchronously via `endSession`), and GPS. All are synchronous here, so the pool is
    // idle before the async restore runs. @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt `stopNativeWorkForDatabaseRestore`
    AsyncFunction("restoreDatabase") { (uri: String, promise: Promise) in
      self.coordinator.stopScan()
      self.coordinator.stopBoard()
      self.coordinator.stopLocationUpdates()
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try DatabaseBackupManager.restoreBackup(uriString: uri)
          promise.resolve(nil)
        } catch {
          promise.reject("ERR_RESTORE_DATABASE", error.localizedDescription)
        }
      }
    }

    AsyncFunction("getRefloatConfigSnapshot") { (promise: Promise) in
      self.coordinator.getRefloatConfigSnapshot(
        onSuccess: { snapshot in promise.resolve(snapshot) },
        onError: { code, message in promise.reject(code, message) }
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

    // MARK: - Tune Profiles (#161)
    // DB-backed per-board VESC tune configs with Tune History, matching Android 1:1. `TuneProfileStore`
    // owns the transactional semantics; mutations reject with Android's error vocabulary.

    AsyncFunction("getTuneProfiles") { (boardId: String, promise: Promise) in
      promise.resolve(TuneProfileStore.shared.getTuneProfiles(boardId))
    }

    AsyncFunction("getTuneProfile") { (profileId: String, promise: Promise) in
      promise.resolve(TuneProfileStore.shared.getTuneProfile(profileId))
    }

    AsyncFunction("createProfile") { (boardId: String, name: String, fields: [String: Any], promise: Promise) in
      do {
        promise.resolve(try TuneProfileStore.shared.createProfile(boardId: boardId, name: name, fields: fields))
      } catch {
        promise.reject(TuneProfileStore.errorCode, error.localizedDescription)
      }
    }

    AsyncFunction("renameProfile") { (profileId: String, name: String, promise: Promise) in
      do {
        promise.resolve(try TuneProfileStore.shared.renameProfile(profileId: profileId, name: name))
      } catch {
        promise.reject(TuneProfileStore.errorCode, error.localizedDescription)
      }
    }

    AsyncFunction("deleteProfile") { (profileId: String, promise: Promise) in
      do {
        try TuneProfileStore.shared.deleteProfile(profileId: profileId)
        promise.resolve(nil)
      } catch {
        promise.reject(TuneProfileStore.errorCode, error.localizedDescription)
      }
    }

    AsyncFunction("getProfileHistory") { (profileId: String, promise: Promise) in
      promise.resolve(TuneProfileStore.shared.getProfileHistory(profileId))
    }

    AsyncFunction("rollbackProfile") { (profileId: String, historyEntryId: Double, promise: Promise) in
      do {
        promise.resolve(
          try TuneProfileStore.shared.rollbackProfile(profileId: profileId, historyEntryId: Int64(historyEntryId))
        )
      } catch {
        promise.reject(TuneProfileStore.errorCode, error.localizedDescription)
      }
    }

    AsyncFunction("copyProfileToBoard") { (profileId: String, targetBoardId: String, newName: String, promise: Promise) in
      do {
        promise.resolve(
          try TuneProfileStore.shared.copyProfileToBoard(
            profileId: profileId,
            targetBoardId: targetBoardId,
            newName: newName
          )
        )
      } catch {
        promise.reject(TuneProfileStore.errorCode, error.localizedDescription)
      }
    }

    AsyncFunction("saveProfile") { (profileId: String, fields: [String: Any], promise: Promise) in
      do {
        promise.resolve(try TuneProfileStore.shared.saveProfile(profileId: profileId, fields: fields))
      } catch {
        promise.reject(TuneProfileStore.errorCode, error.localizedDescription)
      }
    }

    // TODO(iOS parity): `pushProfileToBoard` depends on the Refloat config-write subsystem
    // (Android `VescForegroundService.pushProfileToBoard` -> pending-config-write), which is
    // unported on iOS and deferred by ADR 0011. Reject with Android's error vocabulary until then.
    AsyncFunction("pushProfileToBoard") { (_: String, promise: Promise) in
      promise.reject(
        "BOARD_NOT_CONNECTED",
        "Tune Profile push to board is not yet supported on iOS (Refloat config write not ported)"
      )
    }

    AsyncFunction("getTotalProfileStats") { (promise: Promise) in
      promise.resolve(ProfileStatsRepository.shared.getTotalProfileStats())
    }

    AsyncFunction("getMonthlyProfileStats") { (options: [String: Any], promise: Promise) in
      promise.resolve(ProfileStatsRepository.shared.getMonthlyProfileStats(options))
    }

    AsyncFunction("getProfileStatMonths") { (promise: Promise) in
      promise.resolve(ProfileStatsRepository.shared.getProfileStatMonths())
    }

    AsyncFunction("deleteTelemetryBefore") { (beforeMs: Double, promise: Promise) in
      promise.resolve(TelemetryRepository.shared.deleteBefore(Int64(beforeMs)))
    }

    AsyncFunction("deleteTelemetryRange") { (options: [String: Any], promise: Promise) in
      promise.resolve(TelemetryRepository.shared.deleteRange(options))
    }

    // Gate progress on foreground + active listener and hop to main, like every other JS emit. The
    // rebuild callback fires from a background queue; skip the void when JS isn't listening.
    // @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt `rebuildTelemetryBuckets`
    AsyncFunction("rebuildTelemetryBuckets") { (promise: Promise) in
      let count = TelemetryRepository.shared.rebuildBuckets { current, total in
        guard self.shouldEmitToFrontend("onTelemetryRebuildProgress") else { return }
        DispatchQueue.main.async {
          guard self.shouldEmitToFrontend("onTelemetryRebuildProgress") else { return }
          self.sendEvent("onTelemetryRebuildProgress", ["current": current, "total": total])
        }
      }
      promise.resolve(count)
    }

    AsyncFunction("clearTelemetryHistory") { (promise: Promise) in
      TelemetryRepository.shared.clearAll()
      promise.resolve(nil)
    }

    AsyncFunction("getBoards") { (promise: Promise) in
      promise.resolve(self.appData.getBoards())
    }

    AsyncFunction("upsertBoard") { (board: [String: Any], promise: Promise) in
      self.appData.upsertBoard(board)
      self.coordinator.reloadBoardDataForActiveBoard()
      promise.resolve(nil)
    }

    AsyncFunction("deleteBoard") { (id: String, promise: Promise) in
      self.appData.deleteBoard(id)
      promise.resolve(nil)
    }

    AsyncFunction("getAlertRules") { (promise: Promise) in
      promise.resolve(self.appData.getAlertRules())
    }

    AsyncFunction("upsertAlertRule") { (rule: [String: Any], promise: Promise) in
      self.appData.upsertAlertRule(rule)
      self.coordinator.reloadAlertRules()
      promise.resolve(nil)
    }

    AsyncFunction("setAlertRuleEnabled") { (id: String, enabled: Bool, promise: Promise) in
      self.appData.setAlertRuleEnabled(id, enabled)
      self.coordinator.reloadAlertRules()
      promise.resolve(nil)
    }

    AsyncFunction("deleteAlertRule") { (id: String, promise: Promise) in
      self.appData.deleteAlertRule(id)
      self.coordinator.reloadAlertRules()
      promise.resolve(nil)
    }

    AsyncFunction("getPrivacyZones") { (promise: Promise) in
      promise.resolve(self.appData.getPrivacyZones())
    }

    AsyncFunction("upsertPrivacyZone") { (zone: [String: Any], promise: Promise) in
      self.appData.upsertPrivacyZone(zone)
      self.reloadPrivacyZonesIntoRecorder()
      promise.resolve(nil)
    }

    AsyncFunction("setPrivacyZoneEnabled") { (id: String, enabled: Bool, promise: Promise) in
      self.appData.setPrivacyZoneEnabled(id, enabled)
      self.reloadPrivacyZonesIntoRecorder()
      promise.resolve(nil)
    }

    AsyncFunction("deletePrivacyZone") { (id: String, promise: Promise) in
      self.appData.deletePrivacyZone(id)
      self.reloadPrivacyZonesIntoRecorder()
      promise.resolve(nil)
    }

    AsyncFunction("getMapPoints") { (promise: Promise) in
      promise.resolve(self.appData.getMapPoints())
    }

    AsyncFunction("upsertMapPoint") { (point: [String: Any], promise: Promise) in
      self.appData.upsertMapPoint(point)
      promise.resolve(nil)
    }

    AsyncFunction("replaceDirectionMapPoint") { (point: [String: Any], promise: Promise) in
      self.appData.replaceDirectionMapPoint(point)
      promise.resolve(nil)
    }

    AsyncFunction("deleteMapPoint") { (id: String, promise: Promise) in
      self.appData.deleteMapPoint(id)
      promise.resolve(nil)
    }

    AsyncFunction("getSettings") { (promise: Promise) in
      promise.resolve(self.appData.getSettings())
    }

    // JS sends the raw setting value (bool/number/string/object/null), matching Android's
    // `Any?` param. `getAny()` recursively converts the JS value to native primitives; it must run
    // on the JS thread, so this stays a synchronous `Function` (like `setSelectedBoard`) rather than
    // an off-thread `AsyncFunction` that would touch a live `JavaScriptValue` on a worker queue.
    // `appData.updateSetting` treats `NSNull` (JS null/undefined) as a delete.
    Function("updateSetting") { (key: String, value: JavaScriptValue) in
      self.appData.updateSetting(key, rawValue: value.getAny())
      if [
        "liveHistoryLimit",
        "movingSpeedThresholdKmh",
        "avgSpeedCutoffKmh",
        "movingAvgSpeedThresholdKmh",
        "freeSpinMaxSpeedDeltaKmh",
        "freeSpinStationaryBoardCapKmh",
        "socEstimateWindowSeconds",
        "telemetryPollRateHz",
      ].contains(key) {
        self.coordinator.reloadTelemetrySettings()
      }
    }
  }

  // MARK: - Board Probe

  /// Run a Board Probe of one BLE peripheral: end any live Board Session (the probe owns the
  /// single BLE link), then drive `BoardTransportDetector` and resolve with the confirmed
  /// candidate set. Mirrors Android `probeBoardLink`.
  private func startProbe(bleId: String, promise: Promise) {
    guard !bleId.isEmpty else {
      promise.reject("INVALID_ARGUMENT", "Board Probe needs a BLE peripheral id")
      return
    }
    coordinator.stopBoard()
    let detector = BoardTransportDetector(
      bleId: bleId,
      onProgress: { [weak self] progress in self?.sendEvent("onBoardProbeProgress", progress) },
      onComplete: { [weak self] result in
        self?.activeProbe = nil
        promise.resolve(self?.probeResultToBridge(result) ?? ["outcome": "none", "candidates": [] as [Any]])
      },
      onError: { [weak self] code, message in
        self?.activeProbe = nil
        promise.reject(code, message)
      }
    )
    activeProbe = detector
    detector.start()
  }

  private func probeResultToBridge(_ result: TransportDetection.Result) -> [String: Any?] {
    let candidates = result.candidates.map { candidate in
      ["transport": candidate.transport.bridgeValue, "hasBms": candidate.hasBms] as [String: Any?]
    }
    let outcome: String
    switch result.outcome {
    case .resolved: outcome = "resolved"
    case .needsPick: outcome = "needs-pick"
    case .none: outcome = "none"
    }
    return ["outcome": outcome, "candidates": candidates]
  }

  // MARK: - Coordinator sink attach/detach

  /// Wire this module's JS-facing sinks into the shared coordinator. Runs on module create — including
  /// the fresh module built after a JS reload — so events flow and `onLiveState` recomposes against
  /// the still-running session. Mirrors Android setting `VescForegroundService.emitEvent`.
  private func attachToCoordinator() {
    coordinator.emit = { [weak self] name, body in
      guard let self, self.shouldEmitToFrontend(name) else { return }
      self.sendEvent(name, body)
    }
    coordinator.onStateChanged = { [weak self] in
      guard let self, self.shouldEmitToFrontend("onLiveState") else { return }
      self.sendEvent("onLiveState", self.liveState())
    }
  }

  /// Drop the JS sinks so the coordinator emits into the void once this module dies, without ending
  /// the native session. Mirrors Android nulling `VescForegroundService.emitEvent` in `OnDestroy`.
  private func detachFromCoordinator() {
    coordinator.emit = nil
    coordinator.onStateChanged = nil
  }

  // MARK: - Board session bridge

  /// Auto-connect the selected board at app launch, native-driven and independent of JS. Mirrors
  /// Android's `VescAutoConnectProvider` (fires at process start) → `autoConnectSelectedBoard`: JS
  /// never triggers this, it only toggles the `autoConnect` setting. No-ops when auto-connect is
  /// off, no board is selected, or the board is unlinked.
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/BoardSessionController.kt `autoConnectSelectedBoard`
  private func autoConnectSelectedBoard() {
    // The shared coordinator already owns a live session (e.g. this module was rebuilt by a JS
    // reload mid-ride) — never restart it; the new module only re-attached its sinks. Mirrors
    // Android, where auto-connect fires once at process start, not on every module create.
    guard coordinator.connectedBoardId == nil else { return }
    let settings = appData.getSettings()
    guard settings["autoConnect"] as? Bool ?? true else { return }
    guard let boardId = settings["selectedBoardId"] as? String, !boardId.isEmpty else { return }
    DispatchQueue.main.async {
      guard let config = self.connectConfig(boardId: boardId) else { return }
      self.selectedBoardId = boardId
      self.coordinator.connect(config: config, onSuccess: {}, onError: { _, _ in })
    }
  }

  /// Resolve a stored board's Board Link into a runtime connect config. Returns `nil` when the
  /// board is unlinked (JS routes those to Board Probe instead). Dumb connect (ADR 0015): the
  /// transport is read straight from the link, never rediscovered.
  private func connectConfig(boardId: String) -> BoardConnectConfig? {
    guard let board = appData.getBoard(boardId) else { return nil }
    guard let link = board["link"] as? [String: Any?] else { return nil }
    guard let bleId = link["bleId"] as? String, !bleId.isEmpty else { return nil }
    let transport = BoardTransport.fromBridge(link["transport"] ?? nil) ?? .direct
    let name = board["name"] as? String ?? "VESC Board"
    let settings = appData.getSettings()
    let hz = AppDataRepository.intValue(settings["telemetryPollRateHz"] ?? nil) ?? 0
    return BoardConnectConfig(
      appBoardId: boardId,
      bleId: bleId,
      name: name,
      transport: transport,
      hasBms: link["hasBms"] as? Bool,
      pollIntervalMs: hz > 0 ? 1000 / hz : 0,
      batteryConfig: AppDataRepository.normalizeBatteryConfig(board["batteryConfig"] ?? nil),
      liveHistoryLimitMinutes: AppDataRepository.liveHistoryLimitMinutes(settings["liveHistoryLimit"] ?? nil) ?? 5
    )
  }

  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescLiveStateMapper.kt `buildLiveState`
  private func liveState() -> [String: Any?] {
    let settings = appData.getSettings()
    return [
      "board": [
        "phase": coordinator.phase.rawValue,
        "selectedBoardId": selectedBoardId ?? (settings["selectedBoardId"] ?? nil),
        "connectedBoardId": coordinator.connectedBoardId,
        "bleId": coordinator.bleId,
        "name": coordinator.boardName,
        "connectionSeq": coordinator.connectionSeq,
        "lastTelemetryAt": coordinator.lastTelemetryAt,
        "recentTelemetry": coordinator.recentTelemetry(),
        "error": coordinator.boardError,
        "autoConnect": settings["autoConnect"] as? Bool ?? true,
        "remoteTilt": coordinator.remoteTiltState(),
      ] as [String: Any?],
      "gps": [
        "phase": coordinator.gpsActive() ? "active" : "idle",
        "latestFix": coordinator.gpsLatestPreciseLocation(),
        "latestApproximateFix": coordinator.gpsLatestLocation(),
        "latestPreciseFix": coordinator.gpsLatestPreciseLocation(),
        "recentLocations": coordinator.gpsRecentLocations(),
        "error": coordinator.gpsLastError(),
      ] as [String: Any?],
      "scan": [
        "phase": coordinator.scanPhase,
        "devices": [] as [Any],
        "error": coordinator.scanError,
      ] as [String: Any?],
      "recording": [
        "enabled": coordinator.telemetryRecordingEnabled(),
        "paused": coordinator.recordingPaused(),
        "activeBoardId": coordinator.recordingActiveBoardId(),
        // Always null, matching Android's live-state mapper — JS never consumes a real timestamp.
        // @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescLiveStateMapper.kt
        "startedAt": nil,
      ] as [String: Any?],
    ]
  }

  /// True only when the app is foregrounded and JS is actively listening to `name`. Gates the
  /// coordinator's JS-facing emits so the telemetry firehose sleeps in the background.
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt `shouldEmitToFrontend`
  private func shouldEmitToFrontend(_ name: String) -> Bool {
    frontendActive && observedEvents.contains(name)
  }

  /// Push the current enabled Privacy Zones into the recording store so mid-ride edits take effect
  /// immediately, not just on the next session. Mirrors Android `reloadPrivacyZonesIntoRecorder`.
  private func reloadPrivacyZonesIntoRecorder() {
    TelemetryRepository.shared.reloadPrivacyZones(appData.getEnabledPrivacyZoneEntities())
  }

  /// Emit `onAppDataChanged` so JS reloads the store for [scope]. Bypasses the `frontendActive`
  /// firehose gate — these are low-rate config writes JS must not miss (Android emits regardless).
  /// `sendEvent` must run on the main thread, so hop over from any background write closure.
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/AppDataRepository.kt `notifyDataChanged`
  private func sendAppDataChanged(_ scope: String) {
    DispatchQueue.main.async { self.sendEvent("onAppDataChanged", ["scope": scope]) }
  }

  private func emitUnsupported(_ message: String) {
    sendEvent("onError", ["message": message])
  }
}
