import ExpoModulesCore

// iOS stub.
// A full CoreBluetooth implementation can be added here when needed.
public class VescBleModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VescBle")

    Events("onDevice", "onNotification", "onConnected", "onDisconnected", "onError")

    Function("scan") { }
    Function("stopScan") { }

    AsyncFunction("connect") { (_: String, promise: Promise) in
      promise.reject("NOT_IMPLEMENTED", "VescBle iOS is not yet implemented")
    }
    AsyncFunction("send") { (_: String, promise: Promise) in
      promise.reject("NOT_IMPLEMENTED", "VescBle iOS is not yet implemented")
    }
    AsyncFunction("disconnect") { (promise: Promise) in
      promise.resolve(nil)
    }
  }
}
