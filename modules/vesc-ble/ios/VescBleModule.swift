import ExpoModulesCore

// iOS stub.
// A full CoreBluetooth implementation can be added here when needed.
public class VescBleModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VescBle")

    Events("onDevice", "onNotification", "onConnected", "onDisconnected", "onError", "onStopRequested", "onSessionState", "onTelemetry")

    Function("scan") { }
    Function("stopScan") { }

    AsyncFunction("startSession") { (_: [String: Any], promise: Promise) in
      promise.reject("NOT_IMPLEMENTED", "VescBle iOS is not yet implemented")
    }
    AsyncFunction("stopSession") { (promise: Promise) in
      promise.resolve(nil)
    }
    Function("getSessionState") {
      [
        "status": "idle",
        "mode": nil,
        "deviceId": nil,
        "deviceName": nil,
        "canId": nil,
        "telemetry": nil,
        "error": nil,
      ] as [String: Any?]
    }
    AsyncFunction("listRecordings") { (promise: Promise) in
      promise.resolve([])
    }
    AsyncFunction("deleteRecording") { (_: String, promise: Promise) in
      promise.resolve(false)
    }
    AsyncFunction("exportRecording") { (_: String, promise: Promise) in
      promise.reject("NOT_IMPLEMENTED", "Recording export is not implemented on iOS")
    }
  }
}
