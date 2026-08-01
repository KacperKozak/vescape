import Foundation

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
  /// Owning Board (`boards.id`) — what frames and buckets are keyed on (ADR 0028).
  let boardId: String?
  /// BLE identifier; still stamped on markers and diagnostic events, never on frames or buckets.
  let deviceId: String?
  let deviceName: String?
  let canId: Int?
  let telemetry: RefloatTelemetry
  let location: TelemetryLocationCapture?
}

internal struct BucketTelemetryPoint {
  let capturedAtMs: Int64
  /// Owning Board (`boards.id`); the durable identity telemetry is keyed on (ADR 0028).
  let boardId: String?
  /// BLE identifier. Not stored on frames or buckets — only Metric Exclusion Ranges still key on it.
  let deviceId: String?
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

internal struct FullTelemetryState {
  let capture: TelemetryCapture

  var t: RefloatTelemetry { capture.telemetry }
  var capturedAtMs: Int64 { capture.capturedAtMs }
  var elapsedRealtimeMs: Int64 { capture.elapsedRealtimeMs }
  var boardId: String? { capture.boardId }
  var deviceId: String? { capture.deviceId }
  var deviceName: String? { capture.deviceName }
  var location: TelemetryLocationCapture? { capture.location }

  func toBucketPoint() -> BucketTelemetryPoint {
    BucketTelemetryPoint(
      capturedAtMs: capturedAtMs,
      boardId: boardId,
      deviceId: deviceId,
      speedCentiKmh: telemetryCenti(t.speed),
      batteryVoltageMv: telemetryMilli(t.batteryVoltage),
      motorCurrentMa: telemetryMilli(t.motorCurrent),
      batteryCurrentMa: telemetryMilli(t.batteryCurrent),
      dutyPermille: telemetryMilli(t.dutyCycle),
      hasFault: t.hasFault,
      odometerCm: t.odometer.map { Int64(($0 * 100.0).rounded()) },
      tempMosfetDeciC: t.tempMosfet.map { telemetryDeci($0) },
      tempMotorDeciC: t.tempMotor.map { telemetryDeci($0) },
      gpsSpeedCentiMps: location?.speedMps.map { telemetryCenti($0) },
      gpsTimestampMs: location?.timestamp,
      gpsAccuracyCm: location?.accuracyM.map { telemetryCenti($0) },
      latitudeE7: location.map { Int64(($0.latitude * 10_000_000.0).rounded()) },
      longitudeE7: location.map { Int64(($0.longitude * 10_000_000.0).rounded()) },
      bearingCentiDeg: location?.bearingDeg.map { telemetryCenti($0) },
      altitudeCm: location?.altitudeM.map { telemetryCenti($0) },
      preciseGps: location?.precise ?? false
    )
  }
}

