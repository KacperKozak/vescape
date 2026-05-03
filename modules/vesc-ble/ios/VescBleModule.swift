import ExpoModulesCore
import Foundation

// iOS simulator mock.
// Emits realistic fake data so the UI can be explored without real BLE hardware.
// A full CoreBluetooth implementation can replace this when needed.
public class VescBleModule: Module {

  // MARK: - Session state

  private var sessionStatus = "idle"
  private var sessionMode: String? = nil
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

    Events(
      "onDevice", "onNotification", "onConnected", "onDisconnected",
      "onError", "onStopRequested", "onSessionState", "onTelemetry", "onLocation"
    )

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

    Function("startLocationUpdates") { (_: [String: Any]) in
      self.startMockLocation()
    }

    Function("stopLocationUpdates") {
      self.stopLocation()
    }

    // MARK: Telemetry recording toggle (no-op on mock)

    Function("setTelemetryRecordingEnabled") { (_: Bool) in
      // No persistent storage in the iOS mock
    }

    // MARK: Session

    Function("getSessionState") {
      [
        "status": self.sessionStatus,
        "mode": self.sessionMode,
        "deviceId": self.sessionDeviceId,
        "deviceName": self.sessionDeviceName,
        "canId": nil,
        "telemetry": nil,
        "error": nil,
        "autoReconnect": false,
      ] as [String: Any?]
    }

    AsyncFunction("startSession") { (options: [String: Any], promise: Promise) in
      let mode = options["mode"] as? String ?? "ble"
      let deviceId = options["deviceId"] as? String ?? "MOCK-ID"
      let deviceName = options["deviceName"] as? String ?? "Mock Board"

      self.sessionMode = mode
      self.sessionDeviceId = deviceId
      self.sessionDeviceName = deviceName
      self.sessionStatus = "connecting"

      self.sendEvent("onSessionState", [
        "status": "connecting",
        "mode": mode,
        "deviceId": deviceId,
        "deviceName": deviceName,
        "canId": nil,
        "telemetry": nil,
        "error": nil,
      ] as [String: Any?])

      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
        guard let self = self else { return }
        self.sessionStatus = "connected"
        self.sendEvent("onSessionState", [
          "status": "connected",
          "mode": mode,
          "deviceId": deviceId,
          "deviceName": deviceName,
          "canId": nil,
          "telemetry": nil,
          "error": nil,
        ] as [String: Any?])
        self.startTelemetryTimer()
        promise.resolve(nil)
      }
    }

    AsyncFunction("startAutoConnect") { (options: [String: Any], promise: Promise) in
      let deviceId = options["deviceId"] as? String ?? "MOCK-ID"
      let deviceName = options["deviceName"] as? String ?? "Mock Board"

      self.sessionMode = "ble"
      self.sessionDeviceId = deviceId
      self.sessionDeviceName = deviceName
      self.sessionStatus = "connecting"
      self.sendEvent("onSessionState", [
        "status": "connecting",
        "mode": "ble",
        "deviceId": deviceId,
        "deviceName": deviceName,
        "canId": nil,
        "telemetry": nil,
        "error": nil,
        "autoReconnect": true,
      ] as [String: Any?])
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
        guard let self = self else { return }
        self.sessionStatus = "connected"
        self.sendEvent("onSessionState", [
          "status": "connected",
          "mode": "ble",
          "deviceId": deviceId,
          "deviceName": deviceName,
          "canId": nil,
          "telemetry": nil,
          "error": nil,
          "autoReconnect": true,
        ] as [String: Any?])
        self.startTelemetryTimer()
      }
      promise.resolve(nil)
    }

    AsyncFunction("stopAutoConnect") { (promise: Promise) in
      DispatchQueue.main.async { [weak self] in
        self?.stopMockSession()
      }
      promise.resolve(nil)
    }

    AsyncFunction("stopSession") { (promise: Promise) in
      DispatchQueue.main.async { [weak self] in
        self?.stopMockSession()
      }
      promise.resolve(nil)
    }

    // MARK: Recordings (empty stubs)

    AsyncFunction("listRecordings") { (promise: Promise) in
      promise.resolve([] as [Any])
    }

    AsyncFunction("deleteRecording") { (_: String, promise: Promise) in
      promise.resolve(false)
    }

    AsyncFunction("exportRecording") { (_: String, promise: Promise) in
      promise.reject("NOT_IMPLEMENTED", "Recording export is not implemented on iOS")
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

    AsyncFunction("clearTelemetryHistory") { (promise: Promise) in
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

  private func stopMockSession() {
    telemetryTimer?.invalidate()
    telemetryTimer = nil
    sessionStatus = "idle"
    sessionMode = nil
    sessionDeviceId = nil
    sessionDeviceName = nil
    sendEvent("onSessionState", [
      "status": "idle",
      "mode": nil,
      "deviceId": nil,
      "deviceName": nil,
      "canId": nil,
      "telemetry": nil,
      "error": nil,
    ] as [String: Any?])
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
}
