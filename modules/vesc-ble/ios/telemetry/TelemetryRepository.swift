import Foundation
import GRDB

private let TELEMETRY_FLAG_KEYFRAME = 1
private let TELEMETRY_FLAG_HAS_FAULT = 1 << 1
private let TELEMETRY_FLAG_HAS_LOCATION = 1 << 2
private let TELEMETRY_BUCKET_SIZE_MS: Int64 = 60_000
private let GAP_BOUNDARY_MS: Int64 = 90_000
private let KEYFRAME_INTERVAL_MS: Int64 = 60_000
private let MIN_PERSIST_INTERVAL_MS: Int64 = 500
private let MAX_ENERGY_SAMPLE_GAP_MS: Int64 = 5_000

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
      gpsAccuracyCm: location?.accuracyM.map { centi($0) }
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

  func applySettings(_ settings: [String: Any?]) {
    queue.async { self.metricConfig = MetricSanitizerConfig.from(settings: settings) }
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
    let limit = min(500, max(1, int(options["limit"]) ?? 100))
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
      return rows.map(historyMap)
    }) ?? []
  }

  func getSamples(_ options: [String: Any]) -> [[String: Any?]] {
    guard let pool else { return [] }
    let fromMs = long(options["fromMs"]) ?? 0
    let toMs = long(options["toMs"]) ?? nowMs()
    let limit = min(20_000, max(1, int(options["limit"]) ?? 2_000))
    let deviceId = options["deviceId"] as? String
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
      return rows.map(sampleMap)
    }) ?? []
  }

  func getRange(_ options: [String: Any]) -> [String: Any?] {
    let samples = getSamples(options)
    let fromMs = long(options["fromMs"]) ?? 0
    let toMs = long(options["toMs"]) ?? nowMs()
    let deviceId = options["deviceId"] as? String
    guard let pool else { return ["boardSamples": samples, "gpsSamples": [], "markers": [], "exclusions": []] }
    let extra = (try? pool.read { db -> ([String: Any?], [String: Any?], [String: Any?]) in
      let markers = try Row.fetchAll(
        db,
        sql: "SELECT * FROM telemetry_markers WHERE occurred_at_ms >= ? AND occurred_at_ms <= ? AND (? IS NULL OR device_id = ?) ORDER BY occurred_at_ms ASC",
        arguments: [fromMs, toMs, deviceId, deviceId]
      ).map(markerMap)
      let exclusions = try Row.fetchAll(
        db,
        sql: "SELECT * FROM metric_exclusion_ranges WHERE end_ms >= ? AND start_ms <= ? AND (? IS NULL OR device_id = ?) ORDER BY start_ms ASC",
        arguments: [fromMs, toMs, deviceId, deviceId]
      ).map(exclusionMap)
      let gps = samples.compactMap { sample -> [String: Any?]? in
        guard sample["latitude"] != nil, sample["longitude"] != nil else { return nil }
        return [
          "latitude": sample["latitude"] ?? nil,
          "longitude": sample["longitude"] ?? nil,
          "speedMps": sample["gpsSpeedMps"] ?? nil,
          "bearingDeg": sample["bearingDeg"] ?? nil,
          "accuracyM": sample["accuracyM"] ?? nil,
          "altitudeM": sample["altitudeM"] ?? nil,
          "timestamp": (sample["locationTimestampMs"] ?? nil) ?? (sample["lastPacketAt"] ?? nil),
          "precise": true,
        ]
      }
      return (["gpsSamples": gps], ["markers": markers], ["exclusions": exclusions])
    })
    return ["boardSamples": samples] + (extra?.0 ?? [:]) + (extra?.1 ?? [:]) + (extra?.2 ?? [:])
  }

  func deleteBefore(_ beforeMs: Int64) -> Int {
    guard let pool else { return 0 }
    return (try? pool.write { db in
      let count = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM telemetry_frames WHERE captured_at_ms < ?", arguments: [beforeMs]) ?? 0
      try db.execute(sql: "DELETE FROM telemetry_frames WHERE captured_at_ms < ?", arguments: [beforeMs])
      try db.execute(sql: "DELETE FROM telemetry_minute_buckets WHERE last_sample_at_ms < ?", arguments: [beforeMs])
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
      try db.execute(sql: "DELETE FROM telemetry_frames WHERE captured_at_ms >= ? AND captured_at_ms <= ? AND (? IS NULL OR device_id = ?)", arguments: [fromMs, toMs, deviceId, deviceId])
      try db.execute(sql: "DELETE FROM telemetry_minute_buckets WHERE bucket_start_ms >= ? AND bucket_start_ms <= ? AND (? IS NULL OR device_id = ?)", arguments: [fromMs, toMs, deviceId, deviceId])
      try db.execute(sql: "DELETE FROM metric_exclusion_ranges WHERE end_ms >= ? AND start_ms <= ? AND (? IS NULL OR device_id = ?)", arguments: [fromMs, toMs, deviceId, deviceId])
      try db.execute(sql: "DELETE FROM telemetry_markers WHERE occurred_at_ms >= ? AND occurred_at_ms <= ? AND (? IS NULL OR device_id = ?)", arguments: [fromMs, toMs, deviceId, deviceId])
      return count
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
    let states = pendingStates
    let persisted = pendingPersisted
    let markers = pendingMarkers
    pendingStates.removeAll(keepingCapacity: true)
    pendingPersisted.removeAll(keepingCapacity: true)
    pendingMarkers.removeAll(keepingCapacity: true)

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
      if point.gpsAccuracyCm.map({ $0 <= 2_000 }) ?? false { preciseGpsPointCount += 1 }
      maxGpsSpeedCentiMps = maxOptional(maxGpsSpeedCentiMps, point.gpsSpeedCentiMps)
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
  for point in points {
    let bucketStart = point.capturedAtMs - (point.capturedAtMs % TELEMETRY_BUCKET_SIZE_MS)
    let deviceId = point.deviceId ?? ""
    let key = "\(deviceId):\(bucketStart)"
    var bucket = buckets[key] ?? TelemetryBucket(bucketStartMs: bucketStart, deviceId: deviceId, deviceName: point.deviceName)
    bucket.add(point)
    buckets[key] = bucket
  }
  return Array(buckets.values)
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

private func historyMap(_ row: Row) -> [String: Any?] {
  let sampleCount: Int = row["sample_count"]
  let movingCount: Int? = row["moving_speed_sample_count"]
  let sumMoving: Int64? = row["sum_moving_abs_speed_centi_kmh"]
  let avgSpeed = movingCount.map { $0 > 0 ? Double(sumMoving ?? 0) / Double($0) / 100.0 : 0.0 }
    ?? (sampleCount > 0 ? Double(row["sum_abs_speed_centi_kmh"] as Int64) / Double(sampleCount) / 100.0 : 0.0)
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
    "avgSpeedKmh": avgSpeed,
    "avgSpeedSampleCount": movingCount ?? sampleCount,
    "minBatteryVoltage": (row["min_battery_voltage_mv"] as Int?).map { Double($0) / 1000.0 },
    "maxMotorCurrent": Double(row["max_motor_current_abs_ma"] as Int) / 1000.0,
    "maxBatteryCurrent": Double(row["max_battery_current_abs_ma"] as Int) / 1000.0,
    "maxDuty": Double(row["max_duty_abs_permille"] as Int) / 1000.0,
    "faultCount": row["fault_count"] as Int,
    "batteryUsedWh": Double(row["battery_used_wh_milli"] as Int64) / 1000.0,
    "batteryRegenWh": Double(row["battery_regen_wh_milli"] as Int64) / 1000.0,
    "firstMovingAtMs": row["first_moving_at_ms"] as Int64?,
    "lastMovingAtMs": row["last_moving_at_ms"] as Int64?,
    "boundaryBefore": "none",
    "boundaryMessage": nil,
    "gapBeforeMs": nil,
  ]
}

private func sampleMap(_ row: Row) -> [String: Any?] {
  [
    "id": row["id"] as Int64,
    "lastPacketAt": row["captured_at_ms"] as Int64,
    "deviceId": row["device_id"] as String?,
    "deviceName": row["device_name"] as String? ?? "VESC Board",
    "speed": (row["speed_centi_kmh"] as Int?).map { Double($0) / 100.0 },
    "batteryVoltage": (row["battery_voltage_mv"] as Int?).map { Double($0) / 1000.0 },
    "motorCurrent": (row["motor_current_ma"] as Int?).map { Double($0) / 1000.0 },
    "batteryCurrent": (row["battery_current_ma"] as Int?).map { Double($0) / 1000.0 },
    "dutyCycle": (row["duty_permille"] as Int?).map { Double($0) / 1000.0 },
    "pitch": (row["pitch_centi_deg"] as Int?).map { Double($0) / 100.0 },
    "roll": (row["roll_centi_deg"] as Int?).map { Double($0) / 100.0 },
    "balancePitch": (row["balance_pitch_centi_deg"] as Int?).map { Double($0) / 100.0 },
    "balanceCurrent": (row["balance_current_ma"] as Int?).map { Double($0) / 1000.0 },
    "erpm": row["erpm"] as Int?,
    "state": row["state"] as Int?,
    "switchState": row["switch_state"] as Int?,
    "adc1": (row["adc1_milli"] as Int?).map { Double($0) / 1000.0 },
    "adc2": (row["adc2_milli"] as Int?).map { Double($0) / 1000.0 },
    "odometer": (row["odometer_cm"] as Int64?).map { Double($0) / 100.0 },
    "tempMosfet": (row["temp_mosfet_deci_c"] as Int?).map { Double($0) / 10.0 },
    "tempMotor": (row["temp_motor_deci_c"] as Int?).map { Double($0) / 10.0 },
    "hasFault": ((row["fault_code"] as Int?) ?? 0) != 0,
    "faultCode": row["fault_code"] as Int? ?? 0,
    "latitude": (row["latitude_e7"] as Int64?).map { Double($0) / 10_000_000.0 },
    "longitude": (row["longitude_e7"] as Int64?).map { Double($0) / 10_000_000.0 },
    "gpsSpeedMps": (row["gps_speed_centi_mps"] as Int?).map { Double($0) / 100.0 },
    "bearingDeg": (row["bearing_centi_deg"] as Int?).map { Double($0) / 100.0 },
    "accuracyM": (row["accuracy_cm"] as Int?).map { Double($0) / 100.0 },
    "altitudeM": (row["altitude_cm"] as Int?).map { Double($0) / 100.0 },
    "locationTimestampMs": row["location_timestamp_ms"] as Int64?,
  ]
}

private func markerMap(_ row: Row) -> [String: Any?] {
  ["occurredAtMs": row["occurred_at_ms"] as Int64, "type": row["type"] as String, "message": row["message"] as String?, "gapMs": row["gap_ms"] as Int64?]
}

private func exclusionMap(_ row: Row) -> [String: Any?] {
  ["reason": row["reason"] as String, "startMs": row["start_ms"] as Int64, "endMs": row["end_ms"] as Int64, "sampleCount": row["sample_count"] as Int]
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
