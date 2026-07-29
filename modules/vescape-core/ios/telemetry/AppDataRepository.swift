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
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/AppDataRepository.kt `AppDataScope`
/// @parity /modules/vescape-core/src/index.ts `AppDataChangedEvent`
enum AppDataScope: String {
  case boards
  case settings
  case mapPoints
}

/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/AppDataRepository.kt
final class AppDataRepository {
  static let shared = AppDataRepository()

  /// JS-sync hook, wired by `VescapeCoreModule` on create. Called with a scope wire string after every
  /// persisting write so the matching JS store reloads live. Mirrors Android's
  /// `CoreForegroundService.emitEvent` static — a module-owned emit the repo funnels through.
  static var onDataChanged: ((String) -> Void)?

  private var pool: DatabasePool? { TelemetryDatabase.pool }

  private init() {}

  /// Notify JS that persisted data in [scope] changed, so the matching store reloads and stays in
  /// sync without an app restart. Every mutating method below funnels through here — new writes get
  /// sync for free by tagging the right scope. Idempotent on the JS side, so emitting after a
  /// JS-initiated write is harmless (the reload just confirms native truth).
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/AppDataRepository.kt `notifyDataChanged`
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
      ("topSpeedKmh", Self.topSpeedKmh(board["topSpeedKmh"] ?? nil)),
      ("alertPreset", Self.normalizeAlertPreset(board["alertPreset"] ?? nil)),
      ("alertPresetsOnboarded", board["alertPresetsOnboarded"] as? Bool),
      // Legal Mode changes only through the dedicated native intent.
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
      // Alert Rules are Board-owned (#254) — drop them with the Board so no orphan rows survive.
      try db.execute(sql: "DELETE FROM alerts WHERE board_id = ?", arguments: [id])
      try db.execute(sql: "DELETE FROM boards WHERE id = ?", arguments: [id])
    }
    notifyDataChanged(.boards)
  }

  /// Persist the last Battery SoC Estimate per board so it survives full app kill (#152). Written as
  /// the `lastBattery` board setting; `upsertBoard` never touches this key, so board edits keep it.
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/AppDataRepository.kt `updateLastBattery`
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

  /// Dedicated native Legal Mode write; generic Board upserts cannot bypass enable validation.
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/AppDataRepository.kt `updateLegalMode`
  func updateLegalMode(boardId: String, enabled: Bool) {
    guard let json = Self.encodeJson(["enabled": enabled]) else { return }
    write { db in
      try db.execute(
        sql: "INSERT OR REPLACE INTO board_settings (board_id, key, value_json, updated_at) VALUES (?, ?, ?, ?)",
        arguments: [boardId, "legalMode", json, self.nowMs()]
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
      // Alert Preset board settings, normalized to display defaults when the row is absent so JS
      // always reads a concrete Board Top Speed / onboarded flag. `alertPreset` stays nil until the
      // rider touches setup — no preset rules generate before then.
      "topSpeedKmh": values["topSpeedKmh"] ?? defaultTopSpeedKmh,
      "alertPreset": values["alertPreset"],
      "alertPresetsOnboarded": values["alertPresetsOnboarded"] ?? false,
      "legalMode": values["legalMode"] ?? ["enabled": false],
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
    case "topSpeedKmh":
      return topSpeedKmh(raw)
    case "alertPreset":
      return normalizeAlertPreset(raw)
    case "alertPresetsOnboarded":
      return raw as? Bool
    case "legalMode":
      return normalizeLegalMode(raw)
    default:
      return nil
    }
  }

  /// Durable Alert Preset per-metric level selection bag. JS owns behavior; native persists it as an
  /// opaque object. Non-object/empty payloads normalize away (row removed).
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/AppDataRepository.kt `normalizeAlertPreset`
  private static func normalizeAlertPreset(_ raw: Any?) -> [String: Any]? {
    guard let map = raw as? [String: Any], !map.isEmpty else { return nil }
    return map
  }

  private static func normalizeLegalMode(_ raw: Any?) -> [String: Bool]? {
    guard let map = raw as? [String: Any], let enabled = map["enabled"] as? Bool else { return nil }
    return ["enabled": enabled]
  }

  /// Dismissed Board Warning kinds persisted as a board setting: a non-empty array of kind slugs, or
  /// nil (row removed) when empty/invalid.
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/AppDataRepository.kt `normalizeDismissedWarnings`
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

  func getAlertRules(_ boardId: String) -> [[String: Any?]] {
    read([]) { db in
      try Row.fetchAll(
        db,
        sql: "SELECT * FROM alerts WHERE board_id = ? ORDER BY created_at ASC",
        arguments: [boardId]
      ).map { row in
        [
          "boardId": row["board_id"] as String,
          "id": row["id"] as String,
          "controlId": row["control_id"] as String,
          "threshold": row["threshold"] as Double,
          "thresholdMax": row["threshold_max"] as Double?,
          "enabled": (row["enabled"] as Int64) != 0,
          "soundType": row["sound_type"] as String,
          "createdAt": row["created_at"] as Int64,
          "source": row["source"] as String?,
        ]
      }
    }
  }

  /// The given Board's enabled rules materialized as `AlertRule` for the alert engine. The engine
  /// evaluates only the connected Board's rules. Mirrors Android
  /// `AppDataRepository.getEnabledAlertRuleEntities`.
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/AppDataRepository.kt `getEnabledAlertRuleEntities`
  func getEnabledAlertRules(_ boardId: String) -> [AlertRule] {
    read([]) { db in
      try Row.fetchAll(
        db,
        sql: "SELECT * FROM alerts WHERE board_id = ? AND enabled = 1 ORDER BY created_at ASC",
        arguments: [boardId]
      ).map { row in
        AlertRule(
          boardId: row["board_id"] as String,
          id: row["id"] as String,
          controlId: row["control_id"] as String,
          threshold: row["threshold"] as Double,
          thresholdMax: row["threshold_max"] as Double?,
          enabled: (row["enabled"] as Int64) != 0,
          soundType: row["sound_type"] as String,
          createdAt: row["created_at"] as Int64,
          source: row["source"] as String?
        )
      }
    }
  }

  func upsertAlertRule(_ rule: [String: Any?]) {
    guard
      let boardId = rule["boardId"] as? String,
      let id = rule["id"] as? String,
      let controlId = rule["controlId"] as? String
    else { return }
    let threshold = Self.doubleValue(rule["threshold"] ?? nil) ?? 0
    let thresholdMax = Self.doubleValue(rule["thresholdMax"] ?? nil)
    let enabled = (rule["enabled"] as? Bool) ?? false
    let soundType = rule["soundType"] as? String ?? "default"
    let createdAt = Self.longValue(rule["createdAt"] ?? nil) ?? nowMs()
    let source = rule["source"] as? String
    write { db in
      try db.execute(
        sql: """
          INSERT OR REPLACE INTO alerts (board_id, id, control_id, threshold, threshold_max, enabled, sound_type, created_at, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
        arguments: [boardId, id, controlId, threshold, thresholdMax, enabled ? 1 : 0, soundType, createdAt, source]
      )
    }
  }

  func setAlertRuleEnabled(_ boardId: String, _ id: String, _ enabled: Bool) {
    write { db in
      try db.execute(
        sql: "UPDATE alerts SET enabled = ? WHERE board_id = ? AND id = ?",
        arguments: [enabled ? 1 : 0, boardId, id]
      )
    }
  }

  func deleteAlertRule(_ boardId: String, _ id: String) {
    write { db in
      try db.execute(sql: "DELETE FROM alerts WHERE board_id = ? AND id = ?", arguments: [boardId, id])
    }
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

  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/AppDataRepository.kt `VALID_MAP_POINT_KINDS`
  /// @parity /modules/vescape-core/src/index.ts `MapPointKind`
  private static let validMapPointKinds: Set<String> = [
    "direction", "drop", "bonk", "nose_slide", "trail_entry", "viewpoint", "charging", "charging_food",
  ]
  private static let validMapPointReactions: Set<String> = ["up", "down"]
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/TelemetryEntities.kt `MapPointEntity`
  /// @parity /modules/vescape-core/src/index.ts `MapPoint`
  private struct MapPointColumns {
    let id: String
    let kind: String
    let latitudeE7: Int64
    let longitudeE7: Int64
    let name: String?
    let description: String?
    let mediaJson: String?
    var authorId: String?
    let createdAt: Int64
    let updatedAt: Int64
  }

  private static func reactionScore(_ reaction: String?) -> Int64 {
    if reaction == "up" { return 1 }
    if reaction == "down" { return -1 }
    return 0
  }

  func getMapPoints(clerkUserId: String?) -> [[String: Any?]] {
    read([]) { db in
      let reactions = try Row.fetchAll(db, sql: "SELECT * FROM map_point_reactions")
      let reactionsByPoint = Dictionary(grouping: reactions) { $0["map_point_id"] as String }
      return try Row.fetchAll(db, sql: "SELECT * FROM map_points ORDER BY created_at ASC").map { row in
        let pointReactions = reactionsByPoint[row["id"] as String] ?? []
        let myReaction = pointReactions.first {
          ($0["clerk_user_id"] as String) == clerkUserId
        }
        return [
          "id": row["id"] as String,
          "kind": row["kind"] as String,
          "latitude": (row["latitude_e7"] as Int64).asE7Degrees,
          "longitude": (row["longitude_e7"] as Int64).asE7Degrees,
          "name": row["name"] as String?,
          "description": row["description"] as String?,
          "media": Self.decodeJson((row["media_json"] as? String) ?? "[]") as? [[String: Any?]] ?? [],
          "authorId": row["author_id"] as String?,
          "voteScore": pointReactions.reduce(Int64(0)) {
            $0 + Self.reactionScore($1["reaction"] as String?)
          },
          "myReaction": myReaction?["reaction"] as String?,
          "createdAt": row["created_at"] as Int64,
          "updatedAt": row["updated_at"] as Int64,
        ]
      }
    }
  }

  func upsertMapPoint(_ point: [String: Any?], clerkUserId: String?) {
    guard var entity = Self.mapPointColumns(point) else { return }
    write { db in
      guard entity.kind == "direction" || clerkUserId?.isEmpty == false else { return }
      if let existing = try Row.fetchOne(
        db,
        sql: "SELECT kind, author_id FROM map_points WHERE id = ? LIMIT 1",
        arguments: [entity.id]
      ) {
        let kind: String = existing["kind"]
        let authorId: String? = existing["author_id"]
        guard kind == "direction" || authorId == clerkUserId else { return }
      }
      if entity.kind != "direction" {
        entity.authorId = clerkUserId
      }
      try Self.insertMapPoint(db, entity)
    }
    notifyDataChanged(.mapPoints)
  }

  func setMapPointReaction(_ mapPointId: String, clerkUserId: String, reaction: String?) {
    guard !clerkUserId.isEmpty else { return }
    guard reaction == nil || Self.validMapPointReactions.contains(reaction!) else { return }
    write { db in
      guard try Bool.fetchOne(
        db,
        sql: "SELECT EXISTS(SELECT 1 FROM map_points WHERE id = ?)",
        arguments: [mapPointId]
      ) == true else { return }
      if reaction == nil {
        try db.execute(
          sql: "DELETE FROM map_point_reactions WHERE clerk_user_id = ? AND map_point_id = ?",
          arguments: [clerkUserId, mapPointId]
        )
        return
      }
      try db.execute(
        sql: """
          INSERT INTO map_point_reactions (
            clerk_user_id, map_point_id, reaction, updated_at
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(clerk_user_id, map_point_id) DO UPDATE SET
            reaction = excluded.reaction,
            updated_at = excluded.updated_at
          """,
        arguments: [clerkUserId, mapPointId, reaction, self.nowMs()]
      )
    }
    notifyDataChanged(.mapPoints)
  }

  func replaceDirectionMapPoint(_ point: [String: Any?]) {
    var forced = point
    forced["kind"] = "direction"
    guard let entity = Self.mapPointColumns(forced) else { return }
    write { db in
      try db.execute(sql: "DELETE FROM map_points WHERE kind = 'direction'")
      try Self.insertMapPoint(db, entity)
    }
    notifyDataChanged(.mapPoints)
  }

  func deleteMapPoint(_ id: String, clerkUserId: String?) {
    write { db in
      guard let point = try Row.fetchOne(
        db,
        sql: "SELECT kind, author_id FROM map_points WHERE id = ? LIMIT 1",
        arguments: [id]
      ) else { return }
      let kind: String = point["kind"]
      if kind != "direction" {
        let authorId: String? = point["author_id"]
        guard clerkUserId?.isEmpty == false, authorId == clerkUserId else { return }
      }
      try db.execute(sql: "DELETE FROM map_points WHERE id = ?", arguments: [id])
    }
    notifyDataChanged(.mapPoints)
  }

  private static func insertMapPoint(
    _ db: Database,
    _ c: MapPointColumns
  ) throws {
    try db.execute(
      sql: """
        INSERT INTO map_points (
          id, kind, latitude_e7, longitude_e7, name, description, media_json, author_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind,
          latitude_e7 = excluded.latitude_e7,
          longitude_e7 = excluded.longitude_e7,
          name = excluded.name,
          description = excluded.description,
          media_json = excluded.media_json,
          author_id = excluded.author_id,
          updated_at = excluded.updated_at
        """,
      arguments: [
        c.id, c.kind, c.latitudeE7, c.longitudeE7, c.name, c.description, c.mediaJson,
        c.authorId, c.createdAt, c.updatedAt,
      ]
    )
  }

  private static func mapPointColumns(
    _ point: [String: Any?]
  ) -> MapPointColumns? {
    guard
      let id = point["id"] as? String,
      let kind = (point["kind"] as? String), validMapPointKinds.contains(kind),
      let latitude = doubleValue(point["latitude"] ?? nil), (-90.0...90.0).contains(latitude),
      let longitude = doubleValue(point["longitude"] ?? nil), (-180.0...180.0).contains(longitude)
    else { return nil }
    let now = Int64(Date().timeIntervalSince1970 * 1000)
    let createdAt = longValue(point["createdAt"] ?? nil) ?? now
    let updatedAt = longValue(point["updatedAt"] ?? nil) ?? now
    return MapPointColumns(
      id: id,
      kind: kind,
      latitudeE7: latitude.toE7,
      longitudeE7: longitude.toE7,
      name: optionalString(point["name"] ?? nil),
      description: optionalString(point["description"] ?? nil),
      mediaJson: encodeJson(point["media"] ?? []),
      authorId: optionalString(point["authorId"] ?? nil),
      createdAt: createdAt,
      updatedAt: updatedAt
    )
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
    // Legal Policy is native-owned. JS can request refresh through the dedicated intent.
    guard key != "legalPolicy", key != "legalMode" else { return }
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
    } else if key == "satelliteImageryOpacity" {
      guard let opacity = Self.satelliteImageryOpacity(rawValue) else { return }
      value = opacity
    } else if key == "satelliteMapImageryOpacity" {
      guard let opacity = Self.satelliteImageryOpacity(rawValue) else { return }
      value = opacity
    } else if key == "satelliteImagerySaturation" {
      guard let saturation = Self.satelliteImagerySaturation(rawValue) else { return }
      value = saturation
    } else if key == "boardWarningsEnabled" {
      // Strict Bool (Android rejects non-Boolean too): the board-warnings kill switch must never
      // persist a malformed value that reads back truthy.
      guard let flag = rawValue as? Bool else { return }
      value = flag
    } else if key == "dismissedCommunityMessageIds" {
      guard let ids = Self.dismissedCommunityMessageIds(rawValue) else { return }
      value = ids
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

  /// Persist only the resolved jurisdiction reference; policy values stay in the shared catalog.
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/AppDataRepository.kt `updateLegalPolicy`
  func updateLegalPolicy(jurisdictionCode: String?) {
    let code = jurisdictionCode?.trimmingCharacters(in: .whitespaces).uppercased()
    let value = code.flatMap { $0.count == 2 ? ["jurisdictionCode": $0] : nil }
    write { db in
      guard let value, let json = Self.encodeJson(value) else {
        try db.execute(sql: "DELETE FROM app_settings WHERE key = 'legalPolicy'")
        return
      }
      try db.execute(
        sql: "INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)",
        arguments: ["legalPolicy", json, self.nowMs()]
      )
    }
    notifyDataChanged(.settings)
  }

  // MARK: - Shared pure helpers (also used by VescapeCoreModule bridge glue)

  /// Durable app-scoped settings shape. A TS/Android/iOS parity triangle — the container tag covers
  /// every key; individual literals are not tagged separately (see AGENTS.md).
  /// @parity /modules/vescape-core/src/index.ts `AppSettings`
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/TelemetryEntities.kt `AppSettings`
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
    "legalPolicy": NSNull(),
    "movingSpeedThresholdKmh": 3,
    "freeSpinMaxSpeedDeltaKmh": DEFAULT_FREE_SPIN_MAX_SPEED_DELTA_KMH,
    "freeSpinStationaryBoardCapKmh": DEFAULT_FREE_SPIN_STATIONARY_BOARD_CAP_KMH,
    "satelliteOverlayEnabled": true,
    "satelliteImageryOpacity": 0.2,
    "satelliteMapImageryOpacity": 1.0,
    "satelliteImagerySaturation": -0.35,
    "hideTelemetryMapDetails": true,
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
    "dismissedCommunityMessageIds": [String](),
  ]

  static func normalizeSettings(_ settings: [String: Any]) -> [String: Any] {
    var normalized = settings
    normalized["liveHistoryLimit"] =
      liveHistoryLimitMinutes(settings["liveHistoryLimit"]) ?? defaultSettings["liveHistoryLimit"]
    normalized["satelliteImageryOpacity"] =
      satelliteImageryOpacity(settings["satelliteImageryOpacity"]) ?? defaultSettings["satelliteImageryOpacity"]
    normalized["satelliteMapImageryOpacity"] =
      satelliteImageryOpacity(settings["satelliteMapImageryOpacity"]) ?? defaultSettings["satelliteMapImageryOpacity"]
    normalized["satelliteImagerySaturation"] =
      satelliteImagerySaturation(settings["satelliteImagerySaturation"]) ?? defaultSettings["satelliteImagerySaturation"]
    normalized["legalPolicy"] = normalizeLegalPolicy(settings["legalPolicy"]) ?? NSNull()
    normalized["dismissedCommunityMessageIds"] =
      dismissedCommunityMessageIds(settings["dismissedCommunityMessageIds"]) ?? [String]()
    normalized["legalPolicy"] = normalizeLegalPolicy(settings["legalPolicy"]) ?? NSNull()
    return normalized
  }

  /// Acknowledged Community Message IDs: a de-duplicated list of non-empty ID strings, or `nil` when
  /// the raw value is not an array at all. An empty or all-invalid array normalizes to `[]`.
  static func dismissedCommunityMessageIds(_ value: Any?) -> [String]? {
    guard let array = value as? [Any] else { return nil }
    var seen = Set<String>()
    var result: [String] = []
    for entry in array {
      guard let id = entry as? String, !id.isEmpty, seen.insert(id).inserted else { continue }
      result.append(id)
    }
    return result
  }

  private static func normalizeLegalPolicy(_ raw: Any?) -> [String: String]? {
    guard
      let value = raw as? [String: Any],
      let rawCode = value["jurisdictionCode"] as? String
    else { return nil }
    let code = rawCode.trimmingCharacters(in: .whitespaces).uppercased()
    return code.count == 2 ? ["jurisdictionCode": code] : nil
  }

  /// Display default Board Top Speed in km/h, applied when a Board has no `topSpeedKmh` setting.
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/AppDataRepository.kt `DEFAULT_TOP_SPEED_KMH`
  static let defaultTopSpeedKmh: Double = 50

  /// Board Top Speed in km/h; the speed gauge full-scale. Clamped to a sane 5–150 km/h band.
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/AppDataRepository.kt `normalizeTopSpeedKmh`
  static func topSpeedKmh(_ value: Any?) -> Double? {
    guard let topSpeed = doubleValue(value), topSpeed.isFinite else { return nil }
    return min(150, max(5, topSpeed))
  }

  static func satelliteImageryOpacity(_ value: Any?) -> Double? {
    guard let opacity = doubleValue(value), opacity.isFinite else { return nil }
    return min(1, max(0.1, opacity))
  }

  static func satelliteImagerySaturation(_ value: Any?) -> Double? {
    guard let saturation = doubleValue(value), saturation.isFinite else { return nil }
    return min(1, max(-1, saturation))
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

  static func optionalString(_ raw: Any?) -> String? {
    guard let value = raw as? String else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
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
