import Foundation
import ExpoModulesCore
import GRDB

private let TELEMETRY_FLAG_KEYFRAME = 1
private let TELEMETRY_FLAG_HAS_FAULT = 1 << 1
private let TELEMETRY_FLAG_HAS_LOCATION = 1 << 2
private let TELEMETRY_BUCKET_SIZE_MS: Int64 = 60_000
private let GAP_BOUNDARY_MS: Int64 = 90_000
private let KEYFRAME_INTERVAL_MS: Int64 = 60_000
private let MIN_PERSIST_INTERVAL_MS: Int64 = 500
private let MAX_ENERGY_SAMPLE_GAP_MS: Int64 = 5_000
private let DEFAULT_HISTORY_LIMIT = 100
private let DEFAULT_SAMPLE_LIMIT = 2_000
private let MAX_SAMPLE_LIMIT = 20_000
private let SAMPLE_COLUMN_COUNT = 25

internal struct TelemetryLocationCapture {
  let latitude: Double
  let longitude: Double
  let speedMps: Double?
  let bearingDeg: Double?
  let accuracyM: Double?
  let altitudeM: Double?
  let timestamp: Int64
  let precise: Bool

  var map: [String: Any?] {
    [
      "latitude": latitude,
      "longitude": longitude,
      "speedMps": speedMps,
      "bearingDeg": bearingDeg,
      "accuracyM": accuracyM,
      "altitudeM": altitudeM,
      "timestamp": timestamp,
      "precise": precise,
    ]
  }
}

internal struct TelemetryCapture {
  let capturedAtMs: Int64
  let elapsedRealtimeMs: Int64
  let deviceId: String?
  let deviceName: String?
  let canId: Int?
  let telemetry: RefloatTelemetry
  let location: TelemetryLocationCapture?
}

internal struct BucketTelemetryPoint {
  let capturedAtMs: Int64
  let deviceId: String?
  let deviceName: String?
  let speedCentiKmh: Int
  let batteryVoltageMv: Int
  let motorCurrentMa: Int
  let batteryCurrentMa: Int
  let dutyPermille: Int
  let hasFault: Bool
  let odometerCm: Int64?
  let tempMosfetDeciC: Int?
  let tempMotorDeciC: Int?
  let gpsSpeedCentiMps: Int?
  let gpsTimestampMs: Int64?
  let gpsAccuracyCm: Int?
  let latitudeE7: Int64?
  let longitudeE7: Int64?
  let bearingCentiDeg: Int?
  let altitudeCm: Int?
  let preciseGps: Bool
  var excludedFromAvgSpeed = false
  var excludedFromMaxSpeed = false
  var excludedFromMaxDuty = false
}

private struct FullTelemetryState {
  let capture: TelemetryCapture

  var t: RefloatTelemetry { capture.telemetry }
  var capturedAtMs: Int64 { capture.capturedAtMs }
  var elapsedRealtimeMs: Int64 { capture.elapsedRealtimeMs }
  var deviceId: String? { capture.deviceId }
  var deviceName: String? { capture.deviceName }
  var location: TelemetryLocationCapture? { capture.location }

  func toBucketPoint() -> BucketTelemetryPoint {
    BucketTelemetryPoint(
      capturedAtMs: capturedAtMs,
      deviceId: deviceId,
      deviceName: deviceName,
      speedCentiKmh: centi(t.speed),
      batteryVoltageMv: milli(t.batteryVoltage),
      motorCurrentMa: milli(t.motorCurrent),
      batteryCurrentMa: milli(t.batteryCurrent),
      dutyPermille: milli(t.dutyCycle),
      hasFault: t.hasFault,
      odometerCm: t.odometer.map { Int64(($0 * 100.0).rounded()) },
      tempMosfetDeciC: t.tempMosfet.map { deci($0) },
      tempMotorDeciC: t.tempMotor.map { deci($0) },
      gpsSpeedCentiMps: location?.speedMps.map { centi($0) },
      gpsTimestampMs: location?.timestamp,
      gpsAccuracyCm: location?.accuracyM.map { centi($0) },
      latitudeE7: location.map { Int64(($0.latitude * 10_000_000.0).rounded()) },
      longitudeE7: location.map { Int64(($0.longitude * 10_000_000.0).rounded()) },
      bearingCentiDeg: location?.bearingDeg.map { centi($0) },
      altitudeCm: location?.altitudeM.map { centi($0) },
      preciseGps: location?.precise ?? false
    )
  }
}

/// GRDB writer for iOS Ride Recording telemetry. Raw Telemetry Samples are preserved; Metric
/// Sanitizers only write exclusion ranges and bucket-derived metric values.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryRepository.kt
/// @platform-diff iOS stores full keyframe rows for v1 instead of Android's delta chain; schema,
/// metric exclusions, bucket semantics, markers, and read payloads stay aligned.
internal final class TelemetryRepository {
  static let shared = TelemetryRepository()

  private var pool: DatabasePool? { TelemetryDatabase.pool }
  private let queue = DispatchQueue(label: "vesc.telemetry.repository")
  private var pendingStates: [FullTelemetryState] = []
  private var pendingPersisted: [FullTelemetryState] = []
  private var pendingMarkers: [[String: Any?]] = []
  private var lastFrameAtMs: Int64?
  private var lastHistoryAtMs: Int64?
  private var lastKeyframeAtMs: Int64?
  private var metricConfig = MetricSanitizerConfig()
  private var enabledPrivacyZones: [PrivacyZoneEntity] = []
  private let batteryEstimator = BatterySocEstimator()

  func applySettings(_ settings: [String: Any?]) {
    queue.async { self.metricConfig = MetricSanitizerConfig.from(settings: settings) }
  }

  /// Replace the enabled Privacy Zones consulted while flushing recorded telemetry. Fixes whose
  /// GPS location falls inside any zone are dropped (both the persisted frame and its bucket
  /// contribution) so no location leaks into Ride History.
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryRepository.kt `reloadPrivacyZones`
  func reloadPrivacyZones(_ zones: [PrivacyZoneEntity]) {
    queue.async { self.enabledPrivacyZones = zones }
  }

  func recordTelemetry(_ capture: TelemetryCapture) {
    let state = FullTelemetryState(capture: capture)
    queue.async {
      let gapMs = self.lastHistoryAtMs.map { capture.capturedAtMs - $0 }
      let gap = (gapMs ?? 0) > GAP_BOUNDARY_MS
      let keyframe = self.lastHistoryAtMs == nil || gap || self.lastKeyframeAtMs == nil ||
        capture.capturedAtMs - (self.lastKeyframeAtMs ?? 0) >= KEYFRAME_INTERVAL_MS
      self.pendingStates.append(state)

      let sinceKept = self.lastHistoryAtMs.map { capture.capturedAtMs - $0 }
      let persist = keyframe || capture.telemetry.hasFault || sinceKept == nil || (sinceKept ?? 0) >= MIN_PERSIST_INTERVAL_MS
      if persist {
        self.pendingPersisted.append(state)
        if gap {
          self.pendingMarkers.append(self.marker(type: "gap", capture: capture, gapMs: gapMs))
        }
        self.lastHistoryAtMs = capture.capturedAtMs
        self.lastFrameAtMs = capture.capturedAtMs
        if keyframe { self.lastKeyframeAtMs = capture.capturedAtMs }
      }
      if self.pendingStates.count >= 25 || self.pendingPersisted.count >= 25 {
        self.flushOnQueue()
      }
    }
  }

  func recordMarker(type: String, deviceId: String?, deviceName: String?, message: String? = nil) {
    queue.async {
      self.pendingMarkers.append([
        "occurredAtMs": nowMs(),
        "elapsedRealtimeMs": elapsedMs(),
        "type": type,
        "deviceId": deviceId,
        "deviceName": deviceName,
        "message": message,
        "gapMs": nil,
      ])
      self.flushOnQueue()
    }
  }

  func flushBlocking() {
    queue.sync { self.flushOnQueue() }
  }

  func resetSessionState() {
    queue.async {
      self.lastFrameAtMs = nil
      self.lastHistoryAtMs = nil
      self.lastKeyframeAtMs = nil
    }
  }

  func getSummary() -> [String: Any?] {
    guard let pool else {
      return ["sampleCount": 0, "gpsPointCount": 0, "firstAtMs": nil, "lastAtMs": nil, "droppedPendingSamples": 0]
    }
    return (try? pool.read { db in
      [
        "sampleCount": try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM telemetry_frames") ?? 0,
        "gpsPointCount": try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM telemetry_frames WHERE latitude_e7 IS NOT NULL") ?? 0,
        "firstAtMs": try Int64.fetchOne(db, sql: "SELECT MIN(captured_at_ms) FROM telemetry_frames"),
        "lastAtMs": try Int64.fetchOne(db, sql: "SELECT MAX(captured_at_ms) FROM telemetry_frames"),
        "droppedPendingSamples": 0,
      ]
    }) ?? ["sampleCount": 0, "gpsPointCount": 0, "firstAtMs": nil, "lastAtMs": nil, "droppedPendingSamples": 0]
  }

  func getHistory(_ options: [String: Any]) -> [[String: Any?]] {
    let toMs = long(options["toMs"]) ?? nowMs()
    let fromMs = long(options["fromMs"]) ?? 0
    let beforeMs = long(options["cursorBeforeMs"]) ?? toMs
    let limit = min(500, max(1, int(options["limit"]) ?? DEFAULT_HISTORY_LIMIT))
    let deviceId = options["deviceId"] as? String
    guard let pool else { return [] }
    return (try? pool.read { db in
      let rows = try Row.fetchAll(
        db,
        sql: """
          SELECT * FROM telemetry_minute_buckets
          WHERE bucket_start_ms >= ? AND bucket_start_ms <= ? AND bucket_start_ms < ?
            AND (? IS NULL OR device_id = ?)
          ORDER BY bucket_start_ms DESC
          LIMIT ?
          """,
        arguments: [fromMs, toMs, beforeMs, deviceId, deviceId, limit]
      )
      let markerFrom = (rows.map { $0["bucket_start_ms"] as Int64 }.min() ?? fromMs) - GAP_BOUNDARY_MS
      let markerTo = (rows.map { $0["bucket_start_ms"] as Int64 }.max() ?? toMs) + TELEMETRY_BUCKET_SIZE_MS
      let markers = try Row.fetchAll(
        db,
        sql: "SELECT * FROM telemetry_markers WHERE occurred_at_ms >= ? AND occurred_at_ms <= ? AND (? IS NULL OR device_id = ?) ORDER BY occurred_at_ms ASC",
        arguments: [markerFrom, markerTo, deviceId, deviceId]
      )
      return rows.map { historyMap($0, markers: markers) }
    }) ?? []
  }

  func getSamples(_ options: [String: Any]) -> [[String: Any?]] {
    guard let pool else { return [] }
    let fromMs = long(options["fromMs"]) ?? 0
    let toMs = long(options["toMs"]) ?? nowMs()
    let limit = min(MAX_SAMPLE_LIMIT, max(1, int(options["limit"]) ?? DEFAULT_SAMPLE_LIMIT))
    let deviceId = options["deviceId"] as? String
    // Battery configs and the smoothing window are read up front (each opens its own DB read) so
    // the estimate stays a pure computation inside the frames read below.
    let configs = batteryConfigByDevice()
    let windowMs = socWindowMs()
    return (try? pool.read { db in
      let rows = try Row.fetchAll(
        db,
        sql: """
          SELECT * FROM telemetry_frames
          WHERE captured_at_ms >= ? AND captured_at_ms <= ? AND (? IS NULL OR device_id = ?)
          ORDER BY captured_at_ms ASC
          LIMIT ?
          """,
        arguments: [fromMs, toMs, deviceId, deviceId, limit]
      )
      let percents = self.batteryPercents(rows, configs: configs, windowMs: windowMs)
      return zip(rows, percents).map { sampleMap($0.0, batteryPercent: $0.1) }
    }) ?? []
  }

  func getRange(_ options: [String: Any]) -> [String: Any?] {
    let fromMs = long(options["fromMs"]) ?? 0
    let toMs = long(options["toMs"]) ?? nowMs()
    let limit = min(MAX_SAMPLE_LIMIT, max(1, int(options["limit"]) ?? DEFAULT_SAMPLE_LIMIT))
    let deviceId = options["deviceId"] as? String
    guard let pool else { return emptyRangePayload() }
    // Battery configs and the smoothing window are read up front (each opens its own DB read) so
    // the estimate stays a pure computation inside the range read below.
    let configs = batteryConfigByDevice()
    let windowMs = socWindowMs()
    return (try? pool.read { db -> [String: Any?] in
      let sampleRows = try Row.fetchAll(
        db,
        sql: """
          SELECT * FROM telemetry_frames
          WHERE captured_at_ms >= ? AND captured_at_ms <= ? AND (? IS NULL OR device_id = ?)
          ORDER BY captured_at_ms ASC
          LIMIT ?
          """,
        arguments: [fromMs, toMs, deviceId, deviceId, limit]
      )
      let markers = try Row.fetchAll(
        db,
        sql: "SELECT * FROM telemetry_markers WHERE occurred_at_ms >= ? AND occurred_at_ms <= ? AND (? IS NULL OR device_id = ?) ORDER BY occurred_at_ms ASC",
        arguments: [fromMs, toMs, deviceId, deviceId]
      )
      let exclusions = try Row.fetchAll(
        db,
        sql: "SELECT * FROM metric_exclusion_ranges WHERE end_ms >= ? AND start_ms <= ? AND (? IS NULL OR device_id = ?) ORDER BY start_ms ASC",
        arguments: [fromMs, toMs, deviceId, deviceId]
      ).map(exclusionMap)
      let percents = self.batteryPercents(sampleRows, configs: configs, windowMs: windowMs)
      return sampleColumns(sampleRows, batteryPercents: percents) + [
        "gpsSamples": gpsMaps(sampleRows),
        "markers": markers.map(markerMap),
        "exclusions": exclusions,
      ]
    }) ?? emptyRangePayload()
  }

  // MARK: - Battery SoC on read (ADR-0016)

  /// Per-sample Battery SoC Estimate for a run of frames (ordered by captured_at_ms): the
  /// IR-compensated % from the board's stored battery config, smoothed by a per-device
  /// `SocMedianWindow`. Returns one entry per row (nil where no config is known for the device).
  /// Mirrors how the live path derives % per frame; approximate on read only because Android stores
  /// delta-encoded frames.
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryRepository.kt `smoothedSampleMaps`
  private func batteryPercents(_ rows: [Row], configs: [String: [String: Any]], windowMs: Int64) -> [Double?] {
    var windows: [String: SocMedianWindow] = [:]
    return rows.map { row in
      let deviceId = row["device_id"] as String?
      let voltageV = Double(row["battery_voltage_mv"] as Int? ?? 0) / 1000.0
      let batteryCurrentA = Double(row["battery_current_ma"] as Int? ?? 0) / 1000.0
      guard let deviceId, let raw = deriveBatteryPercent(deviceId: deviceId, voltageV: voltageV, batteryCurrentA: batteryCurrentA, configs: configs) else {
        return nil
      }
      let window = windows[deviceId] ?? {
        let w = SocMedianWindow(windowMs: windowMs)
        windows[deviceId] = w
        return w
      }()
      return window.median(percent: raw, nowMs: row["captured_at_ms"] as Int64)
    }
  }

  /// Derive IR-compensated battery % for one sample, mirroring the live native path.
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryRepository.kt `deriveBatteryPercent`
  private func deriveBatteryPercent(deviceId: String, voltageV: Double, batteryCurrentA: Double, configs: [String: [String: Any]]) -> Double? {
    guard let config = configs[deviceId] else { return nil }
    return batteryEstimator.estimateBatteryPercent(voltageV: voltageV, config: config, batteryCurrentA: batteryCurrentA)
  }

  /// bleId (telemetry deviceId) -> the board's normalized battery config.
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryRepository.kt `batteryConfigByDevice`
  private func batteryConfigByDevice() -> [String: [String: Any]] {
    batteryEstimator.ensureLoaded()
    var result: [String: [String: Any]] = [:]
    for board in AppDataRepository.shared.getBoards() {
      guard
        let link = board["link"] as? [String: Any?],
        let bleId = link["bleId"] as? String,
        let config = board["batteryConfig"] as? [String: Any]
      else { continue }
      result[bleId] = config
    }
    return result
  }

  /// SoC median window length from app settings (seconds → ms), defaulting to Android's 20 s.
  private func socWindowMs() -> Int64 {
    Int64(int(AppDataRepository.shared.getSettings()["socEstimateWindowSeconds"] ?? nil) ?? 20) * 1000
  }

  func deleteBefore(_ beforeMs: Int64) -> Int {
    guard let pool else { return 0 }
    return (try? pool.write { db in
      let count = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM telemetry_frames WHERE captured_at_ms < ?", arguments: [beforeMs]) ?? 0
      try db.execute(sql: "DELETE FROM telemetry_frames WHERE captured_at_ms < ?", arguments: [beforeMs])
      try db.execute(sql: "DELETE FROM telemetry_minute_buckets WHERE bucket_start_ms < ?", arguments: [beforeMs])
      try db.execute(sql: "DELETE FROM telemetry_markers WHERE occurred_at_ms < ?", arguments: [beforeMs])
      try db.execute(sql: "DELETE FROM metric_exclusion_ranges WHERE end_ms < ?", arguments: [beforeMs])
      return count
    }) ?? 0
  }

  func deleteRange(_ options: [String: Any]) -> Int {
    flushBlocking()
    guard let pool else { return 0 }
    let fromMs = long(options["fromMs"]) ?? 0
    let toMs = long(options["toMs"]) ?? 0
    let deviceId = options["deviceId"] as? String
    return (try? pool.write { db in
      let count = try Int.fetchOne(
        db,
        sql: "SELECT COUNT(*) FROM telemetry_frames WHERE captured_at_ms >= ? AND captured_at_ms <= ? AND (? IS NULL OR device_id = ?)",
        arguments: [fromMs, toMs, deviceId, deviceId]
      ) ?? 0
      try db.execute(sql: "DELETE FROM telemetry_frames WHERE captured_at_ms >= ? AND captured_at_ms <= ? AND ((? IS NOT NULL AND device_id = ?) OR (? IS NULL AND device_id IS NULL))", arguments: [fromMs, toMs, deviceId, deviceId, deviceId])
      try db.execute(sql: "DELETE FROM telemetry_minute_buckets WHERE last_sample_at_ms >= ? AND first_sample_at_ms <= ? AND device_id = ?", arguments: [fromMs, toMs, deviceId ?? ""])
      try db.execute(sql: "DELETE FROM metric_exclusion_ranges WHERE end_ms >= ? AND start_ms <= ?", arguments: [fromMs, toMs])
      try db.execute(sql: "DELETE FROM telemetry_markers WHERE occurred_at_ms >= ? AND occurred_at_ms <= ? AND ((? IS NOT NULL AND device_id = ?) OR (? IS NULL AND device_id IS NULL))", arguments: [fromMs, toMs, deviceId, deviceId, deviceId])
      return count
    }) ?? 0
  }

  func rebuildBuckets(onProgress: (Int, Int) -> Void = { _, _ in }) -> Int {
    flushBlocking()
    guard let pool else { return 0 }
    return (try? pool.write { db in
      guard
        let firstMs = try Int64.fetchOne(db, sql: "SELECT MIN(captured_at_ms) FROM telemetry_frames"),
        let lastMs = try Int64.fetchOne(db, sql: "SELECT MAX(captured_at_ms) FROM telemetry_frames")
      else { return 0 }
      try db.execute(sql: "DELETE FROM telemetry_minute_buckets")
      try db.execute(sql: "DELETE FROM metric_exclusion_ranges")

      let chunkMs: Int64 = 3_600_000
      let chunks = Int((lastMs - firstMs) / chunkMs + 1)
      var rebuilt = 0
      onProgress(0, chunks)

      for index in 0..<chunks {
        let chunkFrom = firstMs + Int64(index) * chunkMs
        let chunkTo = min(chunkFrom + chunkMs - 1, lastMs)
        let rows = try Row.fetchAll(
          db,
          sql: """
            SELECT * FROM telemetry_frames
            WHERE captured_at_ms >= ? AND captured_at_ms <= ?
            ORDER BY captured_at_ms ASC
            """,
          arguments: [chunkFrom, chunkTo]
        )
        var points = rows.compactMap(bucketPoint)
        let sanitization = sanitizeTelemetrySamples(points, config: metricConfig)
        for i in points.indices {
          points[i].excludedFromAvgSpeed = sanitization.samples[i].excludedFromAvgSpeed
          points[i].excludedFromMaxSpeed = sanitization.samples[i].excludedFromMaxSpeed
          points[i].excludedFromMaxDuty = sanitization.samples[i].excludedFromMaxDuty
        }
        for range in sanitization.exclusions { try insertExclusion(db, range) }
        let buckets = buildTelemetryBuckets(points)
        for bucket in buckets {
          try upsertBucket(db, bucket)
          rebuilt += 1
        }
        onProgress(index + 1, chunks)
      }
      return rebuilt
    }) ?? 0
  }

  func clearAll() {
    guard let pool else { return }
    try? pool.write { db in
      try db.execute(sql: "DELETE FROM telemetry_frames")
      try db.execute(sql: "DELETE FROM telemetry_minute_buckets")
      try db.execute(sql: "DELETE FROM telemetry_markers")
      try db.execute(sql: "DELETE FROM metric_exclusion_ranges")
    }
    queue.sync {
      pendingStates.removeAll()
      pendingPersisted.removeAll()
      pendingMarkers.removeAll()
      lastFrameAtMs = nil
      lastHistoryAtMs = nil
      lastKeyframeAtMs = nil
    }
  }

  private func flushOnQueue() {
    guard let pool, (!pendingStates.isEmpty || !pendingPersisted.isEmpty || !pendingMarkers.isEmpty) else { return }
    let markers = pendingMarkers
    // Drop any fix inside an enabled Privacy Zone before it reaches storage. Fixes without a
    // location always pass. Bucket source (full rate) and persisted frames are filtered alike so
    // aggregates and detail traces stay consistent.
    let zones = enabledPrivacyZones
    let states = zones.isEmpty ? pendingStates : pendingStates.filter { !Self.isInPrivacyZone($0, zones) }
    let persisted = zones.isEmpty ? pendingPersisted : pendingPersisted.filter { !Self.isInPrivacyZone($0, zones) }
    pendingStates.removeAll(keepingCapacity: true)
    pendingPersisted.removeAll(keepingCapacity: true)
    pendingMarkers.removeAll(keepingCapacity: true)
    guard !states.isEmpty || !persisted.isEmpty || !markers.isEmpty else { return }

    let telemetryPoints = states.map { $0.toBucketPoint() }
    let sanitization = sanitizeTelemetrySamples(telemetryPoints, config: metricConfig)
    var sanitized = telemetryPoints
    for i in sanitized.indices {
      sanitized[i].excludedFromAvgSpeed = sanitization.samples[i].excludedFromAvgSpeed
      sanitized[i].excludedFromMaxSpeed = sanitization.samples[i].excludedFromMaxSpeed
      sanitized[i].excludedFromMaxDuty = sanitization.samples[i].excludedFromMaxDuty
    }
    let buckets = buildTelemetryBuckets(sanitized)

    try? pool.write { db in
      for state in persisted { try insertFrame(db, state) }
      for bucket in buckets { try upsertBucket(db, bucket) }
      for marker in markers { try insertMarker(db, marker) }
      for range in sanitization.exclusions { try insertExclusion(db, range) }
    }
  }

  private func marker(type: String, capture: TelemetryCapture, gapMs: Int64?) -> [String: Any?] {
    [
      "occurredAtMs": capture.capturedAtMs,
      "elapsedRealtimeMs": capture.elapsedRealtimeMs,
      "type": type,
      "deviceId": capture.deviceId,
      "deviceName": capture.deviceName,
      "message": nil,
      "gapMs": gapMs,
    ]
  }

  private static func isInPrivacyZone(_ state: FullTelemetryState, _ zones: [PrivacyZoneEntity]) -> Bool {
    guard let loc = state.location else { return false }
    let latE7 = Int((loc.latitude * 10_000_000.0).rounded())
    let lonE7 = Int((loc.longitude * 10_000_000.0).rounded())
    return isInsideAnyPrivacyZone(latitudeE7: latE7, longitudeE7: lonE7, zones: zones)
  }

  // MARK: - Local Diagnostic Events (ADR 0007)

  /// Persist one Local Diagnostic Event to GRDB. Debug-facing, low-volume connection/telemetry
  /// breadcrumbs — the durable source of truth for field debugging even when remote transport
  /// misses the exact path. Property values are sanitized to JSON scalars; `nil`s are dropped.
  /// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/TelemetryRepository.kt `recordDiagnosticEvent`
  func recordDiagnosticEvent(eventName: String, properties: [String: Any?] = [:]) {
    guard let pool else { return }
    let occurredAtMs = nowMs()
    let elapsed = elapsedMs()
    let operation = properties["operation"] as? String
    let phase = properties["phase"] as? String
    let deviceId = properties["ble_id"] as? String
    let deviceName = properties["board_nickname"] as? String
    let message = properties["message"] as? String
    let propertiesJson = Self.encodeDiagnosticProperties(properties)
    queue.async {
      try? pool.write { db in
        try db.execute(
          sql: """
            INSERT INTO diagnostic_events
              (occurred_at_ms, elapsed_realtime_ms, event_name, operation, phase, device_id, device_name, message, properties_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
          arguments: [occurredAtMs, elapsed, eventName, operation, phase, deviceId, deviceName, message, propertiesJson]
        )
      }
    }
  }

  func getDiagnosticEvents(_ options: [String: Any]) -> [[String: Any?]] {
    guard let pool else { return [] }
    let fromMs = long(options["fromMs"]) ?? 0
    let toMs = long(options["toMs"]) ?? nowMs()
    let deviceId = options["deviceId"] as? String
    let limit = min(1_000, max(1, int(options["limit"]) ?? 200))
    return (try? pool.read { db in
      try Row.fetchAll(
        db,
        sql: """
          SELECT * FROM diagnostic_events
          WHERE occurred_at_ms >= ? AND occurred_at_ms <= ? AND (? IS NULL OR device_id = ?)
          ORDER BY occurred_at_ms DESC
          LIMIT ?
          """,
        arguments: [fromMs, toMs, deviceId, deviceId, limit]
      ).map { row in
        [
          "id": row["id"] as Int64,
          "occurredAtMs": row["occurred_at_ms"] as Int64,
          "eventName": row["event_name"] as String,
          "operation": row["operation"] as String?,
          "phase": row["phase"] as String?,
          "deviceId": row["device_id"] as String?,
          "deviceName": row["device_name"] as String?,
          "message": row["message"] as String?,
          "propertiesJson": row["properties_json"] as String,
        ]
      }
    }) ?? []
  }

  func clearDiagnosticEvents() {
    guard let pool else { return }
    try? pool.write { db in try db.execute(sql: "DELETE FROM diagnostic_events") }
  }

  private static func encodeDiagnosticProperties(_ properties: [String: Any?]) -> String {
    var sanitized: [String: Any] = [:]
    for (key, value) in properties {
      switch value {
      case let value as String: sanitized[key] = value
      // `Bool` bridges to `NSNumber` (as a CFBoolean) so booleans still serialize as true/false.
      case let value as NSNumber: sanitized[key] = value
      case nil, is NSNull: continue
      case let value?: sanitized[key] = String(describing: value)
      }
    }
    guard
      let data = try? JSONSerialization.data(withJSONObject: sanitized),
      let json = String(data: data, encoding: .utf8)
    else { return "{}" }
    return json
  }
}

private struct TelemetryBucket {
  let bucketStartMs: Int64
  let deviceId: String
  var deviceName: String?
  var sampleCount = 0
  var firstSampleAtMs = Int64.max
  var lastSampleAtMs = Int64.min
  var sumAbsSpeedCentiKmh: Int64 = 0
  var movingSpeedSampleCount = 0
  var sumMovingAbsSpeedCentiKmh: Int64 = 0
  var firstMovingAtMs: Int64?
  var lastMovingAtMs: Int64?
  var maxAbsSpeedCentiKmh = 0
  var minBatteryVoltageMv: Int?
  var maxMotorCurrentAbsMa = 0
  var maxBatteryCurrentAbsMa = 0
  var maxDutyAbsPermille = 0
  var faultCount = 0
  var firstOdometerCm: Int64?
  var lastOdometerCm: Int64?
  var gpsPointCount = 0
  var preciseGpsPointCount = 0
  var maxGpsSpeedCentiMps: Int?
  var maxTempMosfetDeciC: Int?
  var maxTempMotorDeciC: Int?
  var firstLatitudeE7: Int64?
  var firstLongitudeE7: Int64?
  var batteryUsedWhMilli: Int64 = 0
  var batteryRegenWhMilli: Int64 = 0
  var lastEnergyPoint: BucketTelemetryPoint?

  mutating func add(_ point: BucketTelemetryPoint) {
    sampleCount += 1
    if point.deviceName != nil { deviceName = point.deviceName }
    firstSampleAtMs = min(firstSampleAtMs, point.capturedAtMs)
    lastSampleAtMs = max(lastSampleAtMs, point.capturedAtMs)
    let absSpeed = abs(point.speedCentiKmh)
    sumAbsSpeedCentiKmh += Int64(absSpeed)
    if !point.excludedFromAvgSpeed {
      movingSpeedSampleCount += 1
      sumMovingAbsSpeedCentiKmh += Int64(absSpeed)
      firstMovingAtMs = min(firstMovingAtMs ?? point.capturedAtMs, point.capturedAtMs)
      lastMovingAtMs = max(lastMovingAtMs ?? point.capturedAtMs, point.capturedAtMs)
    }
    if !point.excludedFromMaxSpeed { maxAbsSpeedCentiKmh = max(maxAbsSpeedCentiKmh, absSpeed) }
    minBatteryVoltageMv = min(minBatteryVoltageMv ?? point.batteryVoltageMv, point.batteryVoltageMv)
    maxMotorCurrentAbsMa = max(maxMotorCurrentAbsMa, abs(point.motorCurrentMa))
    maxBatteryCurrentAbsMa = max(maxBatteryCurrentAbsMa, abs(point.batteryCurrentMa))
    if !point.excludedFromMaxDuty { maxDutyAbsPermille = max(maxDutyAbsPermille, abs(point.dutyPermille)) }
    if point.hasFault { faultCount += 1 }
    if firstOdometerCm == nil { firstOdometerCm = point.odometerCm }
    if point.odometerCm != nil { lastOdometerCm = point.odometerCm }
    maxTempMosfetDeciC = maxOptional(maxTempMosfetDeciC, point.tempMosfetDeciC)
    maxTempMotorDeciC = maxOptional(maxTempMotorDeciC, point.tempMotorDeciC)
    if point.gpsTimestampMs != nil {
      gpsPointCount += 1
      if point.preciseGps || (point.gpsAccuracyCm.map { $0 <= 2_000 } ?? false) { preciseGpsPointCount += 1 }
      maxGpsSpeedCentiMps = maxOptional(maxGpsSpeedCentiMps, point.gpsSpeedCentiMps)
      if firstLatitudeE7 == nil, let latitude = point.latitudeE7, let longitude = point.longitudeE7 {
        firstLatitudeE7 = latitude
        firstLongitudeE7 = longitude
      }
    }
    if let previous = lastEnergyPoint {
      let dtMs = point.capturedAtMs - previous.capturedAtMs
      if dtMs > 0 && dtMs <= MAX_ENERGY_SAMPLE_GAP_MS {
        let wh = Double(previous.batteryVoltageMv) / 1000.0 * Double(previous.batteryCurrentMa) / 1000.0 * Double(dtMs) / 3_600_000.0
        let milli = Int64((abs(wh) * 1000.0).rounded())
        if wh > 0 { batteryUsedWhMilli += milli }
        if wh < 0 { batteryRegenWhMilli += milli }
      }
    }
    lastEnergyPoint = point
  }
}

private func buildTelemetryBuckets(_ points: [BucketTelemetryPoint]) -> [TelemetryBucket] {
  var buckets: [String: TelemetryBucket] = [:]
  for point in points.sorted(by: { $0.capturedAtMs < $1.capturedAtMs }) {
    let bucketStart = point.capturedAtMs - (point.capturedAtMs % TELEMETRY_BUCKET_SIZE_MS)
    let deviceId = point.deviceId ?? ""
    let key = "\(deviceId):\(bucketStart)"
    var bucket = buckets[key] ?? TelemetryBucket(bucketStartMs: bucketStart, deviceId: deviceId, deviceName: point.deviceName)
    bucket.add(point)
    buckets[key] = bucket
  }
  return Array(buckets.values)
}

private func sampleColumns(_ rows: [Row], batteryPercents: [Double?]) -> [String: Any?] {
  var data = Data(capacity: rows.count * SAMPLE_COLUMN_COUNT * MemoryLayout<Double>.size)
  var deviceIds: [String?] = []
  var deviceNames: [String] = []
  var deviceIndex: [String: Int] = [:]
  for (i, row) in rows.enumerated() {
    let id: Int64 = row["id"]
    let rawDeviceId = row["device_id"] as String?
    let key = rawDeviceId ?? ""
    let index = deviceIndex[key] ?? {
      deviceIds.append(rawDeviceId)
      deviceNames.append(row["device_name"] as String? ?? "VESC Board")
      let newIndex = deviceIds.count - 1
      deviceIndex[key] = newIndex
      return newIndex
    }()
    appendDouble(&data, Double(id))
    appendDouble(&data, Double(row["captured_at_ms"] as Int64))
    appendDouble(&data, Double(index))
    appendDouble(&data, Double(row["speed_centi_kmh"] as Int? ?? 0) / 100.0)
    appendDouble(&data, Double(row["battery_voltage_mv"] as Int? ?? 0) / 1000.0)
    appendNullableDouble(&data, batteryPercents[i])
    appendDouble(&data, Double(row["motor_current_ma"] as Int? ?? 0) / 1000.0)
    appendDouble(&data, Double(row["battery_current_ma"] as Int? ?? 0) / 1000.0)
    appendDouble(&data, Double(row["duty_permille"] as Int? ?? 0) / 1000.0)
    appendDouble(&data, Double(row["pitch_centi_deg"] as Int? ?? 0) / 100.0)
    appendDouble(&data, Double(row["roll_centi_deg"] as Int? ?? 0) / 100.0)
    appendDouble(&data, Double(row["balance_pitch_centi_deg"] as Int? ?? 0) / 100.0)
    appendDouble(&data, Double(row["balance_current_ma"] as Int? ?? 0) / 1000.0)
    appendDouble(&data, Double(row["erpm"] as Int? ?? 0))
    appendDouble(&data, Double(row["state"] as Int? ?? 0))
    appendDouble(&data, Double(row["switch_state"] as Int? ?? 0))
    appendDouble(&data, Double(row["adc1_milli"] as Int? ?? 0) / 1000.0)
    appendDouble(&data, Double(row["adc2_milli"] as Int? ?? 0) / 1000.0)
    appendNullableDouble(&data, (row["odometer_cm"] as Int64?).map { Double($0) / 100.0 })
    appendNullableDouble(&data, (row["temp_mosfet_deci_c"] as Int?).map { Double($0) / 10.0 })
    appendNullableDouble(&data, (row["temp_motor_deci_c"] as Int?).map { Double($0) / 10.0 })
    appendDouble(&data, ((row["fault_code"] as Int?) ?? 0) != 0 ? 1.0 : 0.0)
    appendDouble(&data, Double((row["fault_code"] as Int?) ?? 0))
    appendNullableDouble(&data, (row["latitude_e7"] as Int64?).map { Double($0) / 10_000_000.0 })
    appendNullableDouble(&data, (row["longitude_e7"] as Int64?).map { Double($0) / 10_000_000.0 })
  }
  return [
    "boardColumns": (try? NativeArrayBuffer.copy(data: data)) ?? NativeArrayBuffer.allocate(size: 0),
    "boardCount": rows.count,
    "boardDevices": deviceIds,
    "boardDeviceNames": deviceNames,
  ]
}

private func insertFrame(_ db: Database, _ state: FullTelemetryState) throws {
  let t = state.t
  let loc = state.location
  try db.execute(
    sql: """
      INSERT INTO telemetry_frames (
        captured_at_ms, elapsed_realtime_ms, device_id, device_name, can_id, flags, changed_mask_1, changed_mask_2,
        speed_centi_kmh, battery_voltage_mv, motor_current_ma, battery_current_ma, duty_permille,
        pitch_centi_deg, roll_centi_deg, balance_pitch_centi_deg, balance_current_ma, erpm, state,
        switch_state, adc1_milli, adc2_milli, odometer_cm, temp_mosfet_deci_c, temp_motor_deci_c,
        fault_code, latitude_e7, longitude_e7, gps_speed_centi_mps, bearing_centi_deg, accuracy_cm,
        altitude_cm, location_timestamp_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      """,
    arguments: [
      state.capturedAtMs, state.elapsedRealtimeMs, state.deviceId, state.deviceName, state.capture.canId,
      TELEMETRY_FLAG_KEYFRAME | (t.hasFault ? TELEMETRY_FLAG_HAS_FAULT : 0) | (loc == nil ? 0 : TELEMETRY_FLAG_HAS_LOCATION),
      Int.max, 1,
      centi(t.speed), milli(t.batteryVoltage), milli(t.motorCurrent), milli(t.batteryCurrent), milli(t.dutyCycle),
      centi(t.pitch), centi(t.roll), centi(t.balancePitch), milli(t.balanceCurrent), t.erpm, t.state,
      t.switchState, milli(t.adc1), milli(t.adc2), t.odometer.map { Int64(($0 * 100.0).rounded()) },
      t.tempMosfet.map { deci($0) }, t.tempMotor.map { deci($0) }, t.hasFault ? t.faultCode : nil,
      loc.map { Int64(($0.latitude * 10_000_000.0).rounded()) },
      loc.map { Int64(($0.longitude * 10_000_000.0).rounded()) },
      loc?.speedMps.map { centi($0) }, loc?.bearingDeg.map { centi($0) },
      loc?.accuracyM.map { centi($0) }, loc?.altitudeM.map { centi($0) }, loc?.timestamp,
    ]
  )
}

private func upsertBucket(_ db: Database, _ b: TelemetryBucket) throws {
  try db.execute(
    sql: """
      INSERT INTO telemetry_minute_buckets (
        bucket_start_ms, device_id, device_name, sample_count, first_sample_at_ms, last_sample_at_ms,
        sum_abs_speed_centi_kmh, moving_speed_sample_count, sum_moving_abs_speed_centi_kmh,
        max_abs_speed_centi_kmh, min_battery_voltage_mv, max_motor_current_abs_ma,
        max_battery_current_abs_ma, battery_used_wh_milli, battery_regen_wh_milli, max_duty_abs_permille,
        fault_count, first_odometer_cm, last_odometer_cm, gps_point_count, precise_gps_point_count,
        gps_distance_cm, max_gps_speed_centi_mps, max_temp_mosfet_deci_c, max_temp_motor_deci_c,
        first_latitude_e7, first_longitude_e7, first_moving_at_ms, last_moving_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bucket_start_ms, device_id) DO UPDATE SET
        device_name=excluded.device_name,
        sample_count=telemetry_minute_buckets.sample_count + excluded.sample_count,
        last_sample_at_ms=MAX(telemetry_minute_buckets.last_sample_at_ms, excluded.last_sample_at_ms),
        sum_abs_speed_centi_kmh=telemetry_minute_buckets.sum_abs_speed_centi_kmh + excluded.sum_abs_speed_centi_kmh,
        moving_speed_sample_count=telemetry_minute_buckets.moving_speed_sample_count + excluded.moving_speed_sample_count,
        sum_moving_abs_speed_centi_kmh=telemetry_minute_buckets.sum_moving_abs_speed_centi_kmh + excluded.sum_moving_abs_speed_centi_kmh,
        max_abs_speed_centi_kmh=MAX(telemetry_minute_buckets.max_abs_speed_centi_kmh, excluded.max_abs_speed_centi_kmh),
        min_battery_voltage_mv=MIN(telemetry_minute_buckets.min_battery_voltage_mv, excluded.min_battery_voltage_mv),
        max_motor_current_abs_ma=MAX(telemetry_minute_buckets.max_motor_current_abs_ma, excluded.max_motor_current_abs_ma),
        max_battery_current_abs_ma=MAX(telemetry_minute_buckets.max_battery_current_abs_ma, excluded.max_battery_current_abs_ma),
        battery_used_wh_milli=telemetry_minute_buckets.battery_used_wh_milli + excluded.battery_used_wh_milli,
        battery_regen_wh_milli=telemetry_minute_buckets.battery_regen_wh_milli + excluded.battery_regen_wh_milli,
        max_duty_abs_permille=MAX(telemetry_minute_buckets.max_duty_abs_permille, excluded.max_duty_abs_permille),
        fault_count=telemetry_minute_buckets.fault_count + excluded.fault_count,
        last_odometer_cm=COALESCE(excluded.last_odometer_cm, telemetry_minute_buckets.last_odometer_cm),
        gps_point_count=telemetry_minute_buckets.gps_point_count + excluded.gps_point_count,
        precise_gps_point_count=telemetry_minute_buckets.precise_gps_point_count + excluded.precise_gps_point_count,
        max_gps_speed_centi_mps=MAX(telemetry_minute_buckets.max_gps_speed_centi_mps, excluded.max_gps_speed_centi_mps),
        max_temp_mosfet_deci_c=MAX(telemetry_minute_buckets.max_temp_mosfet_deci_c, excluded.max_temp_mosfet_deci_c),
        max_temp_motor_deci_c=MAX(telemetry_minute_buckets.max_temp_motor_deci_c, excluded.max_temp_motor_deci_c),
        first_moving_at_ms=MIN(telemetry_minute_buckets.first_moving_at_ms, excluded.first_moving_at_ms),
        last_moving_at_ms=MAX(telemetry_minute_buckets.last_moving_at_ms, excluded.last_moving_at_ms)
      """,
    arguments: [
      b.bucketStartMs, b.deviceId, b.deviceName, b.sampleCount, b.firstSampleAtMs, b.lastSampleAtMs,
      b.sumAbsSpeedCentiKmh, b.movingSpeedSampleCount, b.sumMovingAbsSpeedCentiKmh, b.maxAbsSpeedCentiKmh,
      b.minBatteryVoltageMv, b.maxMotorCurrentAbsMa, b.maxBatteryCurrentAbsMa, b.batteryUsedWhMilli,
      b.batteryRegenWhMilli, b.maxDutyAbsPermille, b.faultCount, b.firstOdometerCm, b.lastOdometerCm,
      b.gpsPointCount, b.preciseGpsPointCount, b.maxGpsSpeedCentiMps, b.maxTempMosfetDeciC,
      b.maxTempMotorDeciC, b.firstLatitudeE7, b.firstLongitudeE7, b.firstMovingAtMs, b.lastMovingAtMs,
    ]
  )
}

private func insertMarker(_ db: Database, _ marker: [String: Any?]) throws {
  let occurredAtMs = long(marker["occurredAtMs"] ?? nil) ?? nowMs()
  let elapsedRealtimeMs = long(marker["elapsedRealtimeMs"] ?? nil) ?? elapsedMs()
  let type = marker["type"] as? String ?? "event"
  let deviceId = marker["deviceId"] as? String
  let deviceName = marker["deviceName"] as? String
  let message = marker["message"] as? String
  let gapMs = long(marker["gapMs"] ?? nil)
  try db.execute(
    sql: "INSERT INTO telemetry_markers (occurred_at_ms, elapsed_realtime_ms, type, device_id, device_name, message, gap_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
    arguments: [occurredAtMs, elapsedRealtimeMs, type, deviceId, deviceName, message, gapMs]
  )
}

private func insertExclusion(_ db: Database, _ range: MetricExclusionRange) throws {
  try db.execute(
    sql: "INSERT INTO metric_exclusion_ranges (device_id, reason, start_ms, end_ms, sample_count) VALUES (?, ?, ?, ?, ?)",
    arguments: [range.deviceId, range.reason, range.startMs, range.endMs, range.sampleCount]
  )
}

private func historyMap(_ row: Row, markers: [Row]) -> [String: Any?] {
  let sampleCount: Int = row["sample_count"]
  let movingCount: Int? = row["moving_speed_sample_count"]
  let sumMoving: Int64? = row["sum_moving_abs_speed_centi_kmh"]
  let avgSpeed = movingCount.map { $0 > 0 ? Double(sumMoving ?? 0) / Double($0) / 100.0 : 0.0 }
    ?? (sampleCount > 0 ? Double(row["sum_abs_speed_centi_kmh"] as Int64) / Double(sampleCount) / 100.0 : 0.0)
  let marker = markers.last { marker in
    let occurredAtMs = marker["occurred_at_ms"] as Int64
    let markerDevice = marker["device_id"] as String? ?? ""
    let bucketDevice = row["device_id"] as String
    return occurredAtMs >= (row["first_sample_at_ms"] as Int64) - 5_000 &&
      occurredAtMs <= (row["first_sample_at_ms"] as Int64) + 1_000 &&
      markerDevice == bucketDevice
  }
  let distanceDeltaM: Double? = {
    guard let first = row["first_odometer_cm"] as Int64?, let last = row["last_odometer_cm"] as Int64? else { return nil }
    return Double(max(0, last - first)) / 100.0
  }()
  return [
    "id": "\(row["device_id"] as String):\(row["bucket_start_ms"] as Int64)",
    "startAtMs": row["first_sample_at_ms"] as Int64,
    "endAtMs": row["last_sample_at_ms"] as Int64,
    "bucketStartMs": row["bucket_start_ms"] as Int64,
    "deviceId": (row["device_id"] as String).isEmpty ? nil : row["device_id"] as String,
    "deviceName": row["device_name"] as String? ?? "VESC Board",
    "sampleCount": sampleCount,
    "gpsPointCount": row["gps_point_count"] as Int,
    "preciseGpsPointCount": row["precise_gps_point_count"] as Int,
    "maxAbsSpeedKmh": Double(row["max_abs_speed_centi_kmh"] as Int) / 100.0,
    "maxGpsSpeedKmh": (row["max_gps_speed_centi_mps"] as Int?).map { Double($0) / 100.0 * 3.6 },
    "avgSpeedKmh": avgSpeed,
    "avgSpeedSampleCount": movingCount ?? sampleCount,
    "minBatteryVoltage": (row["min_battery_voltage_mv"] as Int?).map { Double($0) / 1000.0 },
    "maxMotorCurrent": Double(row["max_motor_current_abs_ma"] as Int) / 1000.0,
    "maxBatteryCurrent": Double(row["max_battery_current_abs_ma"] as Int) / 1000.0,
    "maxDuty": Double(row["max_duty_abs_permille"] as Int) / 1000.0,
    "faultCount": row["fault_count"] as Int,
    "distanceDeltaM": distanceDeltaM,
    "gpsDistanceM": ((row["gps_distance_cm"] as Int64) > 0) ? Double(row["gps_distance_cm"] as Int64) / 100.0 : nil,
    "maxTempMosfet": (row["max_temp_mosfet_deci_c"] as Int?).map { Double($0) / 10.0 },
    "maxTempMotor": (row["max_temp_motor_deci_c"] as Int?).map { Double($0) / 10.0 },
    "batteryUsedWh": Double(row["battery_used_wh_milli"] as Int64) / 1000.0,
    "batteryRegenWh": Double(row["battery_regen_wh_milli"] as Int64) / 1000.0,
    "firstLatitude": (row["first_latitude_e7"] as Int64?).map { Double($0) / 10_000_000.0 },
    "firstLongitude": (row["first_longitude_e7"] as Int64?).map { Double($0) / 10_000_000.0 },
    "firstMovingAtMs": row["first_moving_at_ms"] as Int64?,
    "lastMovingAtMs": row["last_moving_at_ms"] as Int64?,
    "boundaryBefore": marker?["type"] as String? ?? "none",
    "boundaryMessage": marker?["message"] as String?,
    "gapBeforeMs": marker?["gap_ms"] as Int64?,
  ]
}

private func sampleMap(_ row: Row, batteryPercent: Double?) -> [String: Any?] {
  [
    "id": row["id"] as Int64,
    "capturedAtMs": row["captured_at_ms"] as Int64,
    "deviceId": row["device_id"] as String?,
    "deviceName": row["device_name"] as String? ?? "VESC Board",
    "speedKmh": Double(row["speed_centi_kmh"] as Int? ?? 0) / 100.0,
    "batteryVoltage": Double(row["battery_voltage_mv"] as Int? ?? 0) / 1000.0,
    "batteryPercent": batteryPercent,
    "motorCurrent": Double(row["motor_current_ma"] as Int? ?? 0) / 1000.0,
    "batteryCurrent": Double(row["battery_current_ma"] as Int? ?? 0) / 1000.0,
    "dutyCycle": Double(row["duty_permille"] as Int? ?? 0) / 1000.0,
    "pitch": Double(row["pitch_centi_deg"] as Int? ?? 0) / 100.0,
    "roll": Double(row["roll_centi_deg"] as Int? ?? 0) / 100.0,
    "balancePitch": Double(row["balance_pitch_centi_deg"] as Int? ?? 0) / 100.0,
    "balanceCurrent": Double(row["balance_current_ma"] as Int? ?? 0) / 1000.0,
    "erpm": row["erpm"] as Int? ?? 0,
    "state": row["state"] as Int? ?? 0,
    "switchState": row["switch_state"] as Int? ?? 0,
    "adc1": Double(row["adc1_milli"] as Int? ?? 0) / 1000.0,
    "adc2": Double(row["adc2_milli"] as Int? ?? 0) / 1000.0,
    "odometer": (row["odometer_cm"] as Int64?).map { Double($0) / 100.0 },
    "tempMosfet": (row["temp_mosfet_deci_c"] as Int?).map { Double($0) / 10.0 },
    "tempMotor": (row["temp_motor_deci_c"] as Int?).map { Double($0) / 10.0 },
    "hasFault": ((row["fault_code"] as Int?) ?? 0) != 0,
    "faultCode": row["fault_code"] as Int? ?? 0,
    "latitude": (row["latitude_e7"] as Int64?).map { Double($0) / 10_000_000.0 },
    "longitude": (row["longitude_e7"] as Int64?).map { Double($0) / 10_000_000.0 },
  ]
}

private func markerMap(_ row: Row) -> [String: Any?] {
  [
    "id": row["id"] as Int64,
    "occurredAtMs": row["occurred_at_ms"] as Int64,
    "type": row["type"] as String,
    "deviceId": row["device_id"] as String?,
    "deviceName": row["device_name"] as String?,
    "message": row["message"] as String?,
    "gapMs": row["gap_ms"] as Int64?,
  ]
}

private func exclusionMap(_ row: Row) -> [String: Any?] {
  let reason = row["reason"] as String
  var metrics: [String: Bool] = [:]
  if reason == EXCLUSION_REASON_LOW_SPEED { metrics[METRIC_AVG_SPEED] = true }
  if reason == EXCLUSION_REASON_FREE_SPIN {
    metrics[METRIC_MAX_SPEED] = true
    metrics[METRIC_MAX_DUTY] = true
  }
  return [
    "id": row["id"] as Int64,
    "deviceId": (row["device_id"] as String).isEmpty ? nil : row["device_id"] as String,
    "reason": reason,
    "startMs": row["start_ms"] as Int64,
    "endMs": row["end_ms"] as Int64,
    "sampleCount": row["sample_count"] as Int,
    "metrics": metrics,
  ]
}

private func gpsMaps(_ rows: [Row]) -> [[String: Any?]] {
  var previousByDevice: [String: (lat: Double, lon: Double)] = [:]
  return rows.compactMap { row in
    guard let latitudeE7 = row["latitude_e7"] as Int64?, let longitudeE7 = row["longitude_e7"] as Int64? else {
      return nil
    }
    let latitude = Double(latitudeE7) / 10_000_000.0
    let longitude = Double(longitudeE7) / 10_000_000.0
    let deviceId = row["device_id"] as String? ?? ""
    let previous = previousByDevice[deviceId]
    previousByDevice[deviceId] = (latitude, longitude)
    return [
      "id": row["id"] as Int64,
      "capturedAtMs": row["captured_at_ms"] as Int64,
      "deviceId": (row["device_id"] as String?) ?? nil,
      "deviceName": row["device_name"] as String? ?? "VESC Board",
      "latitude": latitude,
      "longitude": longitude,
      "speedMps": (row["gps_speed_centi_mps"] as Int?).map { Double($0) / 100.0 },
      "bearingDeg": (row["bearing_centi_deg"] as Int?).map { Double($0) / 100.0 },
      "accuracyM": (row["accuracy_cm"] as Int?).map { Double($0) / 100.0 },
      "altitudeM": (row["altitude_cm"] as Int?).map { Double($0) / 100.0 },
      "timestamp": (row["location_timestamp_ms"] as Int64?) ?? (row["captured_at_ms"] as Int64),
      "precise": ((row["accuracy_cm"] as Int?) ?? Int.max) <= 2_000,
      "distanceFromPreviousM": previous.map { haversineM($0.lat, $0.lon, latitude, longitude) },
    ]
  }
}

private func bucketPoint(_ row: Row) -> BucketTelemetryPoint? {
  BucketTelemetryPoint(
    capturedAtMs: row["captured_at_ms"] as Int64,
    deviceId: row["device_id"] as String?,
    deviceName: row["device_name"] as String?,
    speedCentiKmh: row["speed_centi_kmh"] as Int? ?? 0,
    batteryVoltageMv: row["battery_voltage_mv"] as Int? ?? 0,
    motorCurrentMa: row["motor_current_ma"] as Int? ?? 0,
    batteryCurrentMa: row["battery_current_ma"] as Int? ?? 0,
    dutyPermille: row["duty_permille"] as Int? ?? 0,
    hasFault: ((row["fault_code"] as Int?) ?? 0) != 0,
    odometerCm: row["odometer_cm"] as Int64?,
    tempMosfetDeciC: row["temp_mosfet_deci_c"] as Int?,
    tempMotorDeciC: row["temp_motor_deci_c"] as Int?,
    gpsSpeedCentiMps: row["gps_speed_centi_mps"] as Int?,
    gpsTimestampMs: row["location_timestamp_ms"] as Int64?,
    gpsAccuracyCm: row["accuracy_cm"] as Int?,
    latitudeE7: row["latitude_e7"] as Int64?,
    longitudeE7: row["longitude_e7"] as Int64?,
    bearingCentiDeg: row["bearing_centi_deg"] as Int?,
    altitudeCm: row["altitude_cm"] as Int?,
    preciseGps: ((row["accuracy_cm"] as Int?) ?? Int.max) <= 2_000
  )
}

private func emptyRangePayload() -> [String: Any?] {
  [
    "boardColumns": NativeArrayBuffer.allocate(size: 0),
    "boardCount": 0,
    "boardDevices": [] as [String?],
    "boardDeviceNames": [] as [String],
    "gpsSamples": [] as [[String: Any?]],
    "markers": [] as [[String: Any?]],
    "exclusions": [] as [[String: Any?]],
  ]
}

private func appendNullableDouble(_ data: inout Data, _ value: Double?) {
  appendDouble(&data, value ?? Double.nan)
}

private func appendDouble(_ data: inout Data, _ value: Double) {
  var bits = value.bitPattern.littleEndian
  withUnsafeBytes(of: &bits) { data.append(contentsOf: $0) }
}

private func haversineM(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) -> Double {
  let radius = 6_371_000.0
  let dLat = (lat2 - lat1) * .pi / 180.0
  let dLon = (lon2 - lon1) * .pi / 180.0
  let a = sin(dLat / 2) * sin(dLat / 2) +
    cos(lat1 * .pi / 180.0) * cos(lat2 * .pi / 180.0) *
    sin(dLon / 2) * sin(dLon / 2)
  return radius * 2 * atan2(sqrt(a), sqrt(1 - a))
}

private func + (lhs: [String: Any?], rhs: [String: Any?]) -> [String: Any?] {
  lhs.merging(rhs) { _, new in new }
}

private func centi(_ value: Double) -> Int { Int((value * 100.0).rounded()) }
private func milli(_ value: Double) -> Int { Int((value * 1000.0).rounded()) }
private func deci(_ value: Double) -> Int { Int((value * 10.0).rounded()) }
private func maxOptional(_ lhs: Int?, _ rhs: Int?) -> Int? {
  guard let rhs else { return lhs }
  return max(lhs ?? rhs, rhs)
}
private func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000.0) }
private func elapsedMs() -> Int64 { Int64(ProcessInfo.processInfo.systemUptime * 1000.0) }
private func int(_ raw: Any?) -> Int? {
  if let value = raw as? Int { return value }
  if let value = raw as? NSNumber { return value.intValue }
  return nil
}
private func long(_ raw: Any?) -> Int64? {
  if let value = raw as? Int64 { return value }
  if let value = raw as? Int { return Int64(value) }
  if let value = raw as? NSNumber { return value.int64Value }
  return nil
}

private let PROFILE_SESSION_GAP_MS: Int64 = 10 * 60_000
private let PROFILE_BREAK_BOUNDARIES: Set<String> = ["disconnected", "app_stop", "error"]

private struct ProfileStatsMonth: Equatable, Hashable {
  let year: Int
  let month: Int
}

private struct ProfileSessionAggregate {
  let deviceId: String
  var startAtMs: Int64
  var endAtMs: Int64
  var sampleCount: Int
  var avgSpeedSampleCount: Int
  var avgSpeedWeightedSum: Double
  var movingStartAtMs: Int64?
  var movingEndAtMs: Int64?
  var distanceM: Double?
  var topSpeedKmh: Double
  var batteryUsedWh: Double
  var batteryRegenWh: Double
}

/// Profile stats queries over precomputed Ride History buckets.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/ProfileStatsRepository.kt
internal final class ProfileStatsRepository {
  static let shared = ProfileStatsRepository()
  private var pool: DatabasePool? { TelemetryDatabase.pool }

  private init() {}

  func getTotalProfileStats() -> [String: Any?] {
    let buckets = allBuckets()
    return computeProfileStatsForBuckets(buckets: buckets, markers: markersForBuckets(buckets), month: nil)
  }

  func getMonthlyProfileStats(_ options: [String: Any]) -> [String: Any?] {
    guard let year = int(options["year"]), let month = int(options["month"]), (1...12).contains(month) else {
      return emptyProfileStats()
    }
    let buckets = allBuckets()
    return computeProfileStatsForBuckets(
      buckets: buckets,
      markers: markersForBuckets(buckets),
      month: ProfileStatsMonth(year: year, month: month)
    )
  }

  func getProfileStatMonths() -> [[String: Any?]] {
    let buckets = allBuckets()
    return computeProfileStatMonthsForBuckets(buckets: buckets, markers: markersForBuckets(buckets))
      .map { ["year": $0.year, "month": $0.month] }
  }

  private func allBuckets() -> [Row] {
    guard let pool else { return [] }
    return (try? pool.read { db in
      try Row.fetchAll(db, sql: "SELECT * FROM telemetry_minute_buckets ORDER BY bucket_start_ms ASC")
    }) ?? []
  }

  private func markersForBuckets(_ buckets: [Row]) -> [Row] {
    guard let pool, !buckets.isEmpty else { return [] }
    let fromMs = (buckets.map { $0["first_sample_at_ms"] as Int64 }.min() ?? 0) - PROFILE_SESSION_GAP_MS
    let toMs = (buckets.map { $0["last_sample_at_ms"] as Int64 }.max() ?? 0) + TELEMETRY_BUCKET_SIZE_MS
    return (try? pool.read { db in
      try Row.fetchAll(
        db,
        sql: "SELECT * FROM telemetry_markers WHERE occurred_at_ms >= ? AND occurred_at_ms <= ? ORDER BY occurred_at_ms ASC",
        arguments: [fromMs, toMs]
      )
    }) ?? []
  }
}

private func computeProfileStatsForBuckets(
  buckets: [Row],
  markers: [Row],
  month: ProfileStatsMonth?,
  calendar: Calendar = .current
) -> [String: Any?] {
  let sessions = groupProfileSessions(buckets: buckets, markers: markers)
    .filter { $0.avgSpeedSampleCount > 0 }
  let included = month.map { target in
    sessions.filter { profileMonth($0.startAtMs, calendar: calendar) == target }
  } ?? sessions
  guard !included.isEmpty else { return emptyProfileStats() }

  let totalDurationMs = included.reduce(Int64(0)) { total, session in
    let span: Int64
    if let start = session.movingStartAtMs, let end = session.movingEndAtMs {
      span = end - start
    } else {
      span = session.endAtMs - session.startAtMs
    }
    return total + max(0, span)
  }
  let distances = included.compactMap(\.distanceM)
  let avgSpeedSamples = included.reduce(0) { $0 + $1.avgSpeedSampleCount }
  let avgSpeedKmh = avgSpeedSamples > 0
    ? included.reduce(0.0) { $0 + $1.avgSpeedWeightedSum } / Double(avgSpeedSamples)
    : 0.0

  return [
    "distanceM": distances.isEmpty ? nil : distances.reduce(0.0, +),
    "rideCount": included.count,
    "rideTimeMs": totalDurationMs,
    "topSpeedKmh": included.map(\.topSpeedKmh).max() ?? 0.0,
    "avgSpeedKmh": avgSpeedKmh,
    "longestRideM": distances.max(),
    "batteryUsedWh": included.reduce(0.0) { $0 + $1.batteryUsedWh },
    "batteryRegenWh": included.reduce(0.0) { $0 + $1.batteryRegenWh },
  ]
}

private func computeProfileStatMonthsForBuckets(
  buckets: [Row],
  markers: [Row],
  calendar: Calendar = .current
) -> [ProfileStatsMonth] {
  Array(Set(groupProfileSessions(buckets: buckets, markers: markers)
    .filter { $0.avgSpeedSampleCount > 0 }
    .map { profileMonth($0.startAtMs, calendar: calendar) }))
    .sorted {
      $0.year == $1.year ? $0.month > $1.month : $0.year > $1.year
    }
}

private func groupProfileSessions(buckets: [Row], markers: [Row]) -> [ProfileSessionAggregate] {
  guard !buckets.isEmpty else { return [] }
  var sessions: [ProfileSessionAggregate] = []
  var current: ProfileSessionAggregate?
  var previous: Row?

  for bucket in buckets.sorted(by: { ($0["first_sample_at_ms"] as Int64) < ($1["first_sample_at_ms"] as Int64) }) {
    if (bucket["sample_count"] as Int) <= 0 { continue }
    let boundary = markerBoundaryForProfileBucket(bucket, markers: markers)
    let deviceId = bucket["device_id"] as String
    let breakByDevice = current == nil || current?.deviceId != deviceId
    let breakByGap = previous.map { (bucket["first_sample_at_ms"] as Int64) - ($0["last_sample_at_ms"] as Int64) > PROFILE_SESSION_GAP_MS } ?? false
    let breakByBoundary = boundary.map { PROFILE_BREAK_BOUNDARIES.contains($0) } ?? false

    if breakByDevice || breakByGap || breakByBoundary {
      if let current { sessions.append(current) }
      current = ProfileSessionAggregate(
        deviceId: deviceId,
        startAtMs: bucket["first_sample_at_ms"] as Int64,
        endAtMs: bucket["last_sample_at_ms"] as Int64,
        sampleCount: 0,
        avgSpeedSampleCount: 0,
        avgSpeedWeightedSum: 0,
        movingStartAtMs: nil,
        movingEndAtMs: nil,
        distanceM: nil,
        topSpeedKmh: 0,
        batteryUsedWh: 0,
        batteryRegenWh: 0
      )
    }

    if var aggregate = current {
      mergeProfileBucket(bucket, into: &aggregate)
      current = aggregate
    }
    previous = bucket
  }

  if let current { sessions.append(current) }
  return sessions
}

private func markerBoundaryForProfileBucket(_ bucket: Row, markers: [Row]) -> String? {
  markers.last { marker in
    let occurred = marker["occurred_at_ms"] as Int64
    let markerDevice = marker["device_id"] as String? ?? ""
    let bucketDevice = bucket["device_id"] as String
    return occurred >= (bucket["first_sample_at_ms"] as Int64) - 5_000 &&
      occurred <= (bucket["first_sample_at_ms"] as Int64) + 1_000 &&
      markerDevice == bucketDevice
  }.map { $0["type"] as String }
}

private func mergeProfileBucket(_ bucket: Row, into session: inout ProfileSessionAggregate) {
  session.startAtMs = min(session.startAtMs, bucket["first_sample_at_ms"] as Int64)
  session.endAtMs = max(session.endAtMs, bucket["last_sample_at_ms"] as Int64)
  session.sampleCount += bucket["sample_count"] as Int

  if let movingCount = bucket["moving_speed_sample_count"] as Int? {
    session.avgSpeedSampleCount += movingCount
    session.avgSpeedWeightedSum += Double((bucket["sum_moving_abs_speed_centi_kmh"] as Int64?) ?? 0) / 100.0
  } else {
    session.avgSpeedSampleCount += bucket["sample_count"] as Int
    session.avgSpeedWeightedSum += Double(bucket["sum_abs_speed_centi_kmh"] as Int64) / 100.0
  }

  if let first = bucket["first_moving_at_ms"] as Int64? {
    session.movingStartAtMs = session.movingStartAtMs.map { min($0, first) } ?? first
  }
  if let last = bucket["last_moving_at_ms"] as Int64? {
    session.movingEndAtMs = session.movingEndAtMs.map { max($0, last) } ?? last
  }

  session.topSpeedKmh = max(session.topSpeedKmh, Double(bucket["max_abs_speed_centi_kmh"] as Int) / 100.0)
  session.batteryUsedWh += Double(bucket["battery_used_wh_milli"] as Int64) / 1000.0
  session.batteryRegenWh += Double(bucket["battery_regen_wh_milli"] as Int64) / 1000.0

  if let distance = profileDistanceDeltaM(bucket) {
    session.distanceM = (session.distanceM ?? 0) + distance
  }
}

private func profileDistanceDeltaM(_ bucket: Row) -> Double? {
  guard let first = bucket["first_odometer_cm"] as Int64?, let last = bucket["last_odometer_cm"] as Int64? else {
    return nil
  }
  return Double(max(0, last - first)) / 100.0
}

private func profileMonth(_ atMs: Int64, calendar: Calendar) -> ProfileStatsMonth {
  let date = Date(timeIntervalSince1970: Double(atMs) / 1000.0)
  let components = calendar.dateComponents([.year, .month], from: date)
  return ProfileStatsMonth(year: components.year ?? 1970, month: components.month ?? 1)
}

private func emptyProfileStats() -> [String: Any?] {
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
