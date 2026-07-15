import Foundation

/// Single source of every Board Warning kind slug. Detectors reference these instead of holding their
/// own per-detector constants, and the registry's typed report path accepts them, so a mistyped kind
/// is a compile error rather than a warning that silently renders as a raw slug. The `rawValue` string
/// is what crosses the bridge and is stored durably; it must stay in lockstep with the JS
/// `BoardWarningKind` union in `modules/vesc-ble/src/index.ts`.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/BoardWarningKind.kt
enum BoardWarningKind: String, CaseIterable {
  case cellSpread = "cell-spread"
  case batteryConfigMismatch = "battery-config-mismatch"
  case footpadDisabled = "footpad-disabled"
  case lvPushbackLow = "lv-pushback-low"
  case hvPushbackHigh = "hv-pushback-high"
  case dutyPushbackHigh = "duty-pushback-high"
  case movingFaultDisabled = "moving-fault-disabled"
}

/// Board Warning payload serialization: deterministic (sorted-key) JSON built via `JSONSerialization`,
/// never hand-assembled strings. Doubles are rounded to 4 decimals before insertion so raw float noise
/// (e.g. a `3.92 - 3.80` subtraction that lands on `0.11999999999999988`) never reaches the wire.
enum BoardWarningPayload {
  static func round4(_ value: Double) -> Double { (value * 10_000).rounded() / 10_000 }

  static func json(_ fields: [String: Any]) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys]),
          let string = String(data: data, encoding: .utf8)
    else { return "{}" }
    return string
  }
}
