import Foundation

/// Pure Board Link persistence shape shared by GRDB-backed app storage and SwiftPM tests.
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/AppDataRepository.kt `toMap` / `toBoardSettingEntities`
internal enum BoardLinkPersistence {
  static let version = 3

  private static let identityKeys = [
    "hasBms",
    "vescFirmwareVersion",
    "refloatVersion",
    "refloatBaseVersion",
  ]
  private static let stringIdentityKeys = [
    "vescFirmwareVersion",
    "refloatVersion",
    "refloatBaseVersion",
  ]

  static func normalized(_ raw: Any?) -> [String: Any?]? {
    guard
      let link = raw as? [String: Any?],
      let bleId = (link["bleId"] as? String).flatMap({ $0.isEmpty ? nil : $0 }),
      let transport = BoardTransport.fromBridge(link["transport"] ?? nil)
    else { return nil }
    var normalized = link
    normalized["bleId"] = bleId
    normalized["transport"] = transport.bridgeValue
    return normalized
  }

  static func compose(bleId: String?, storedTransport: String?, values: [String: Any]) -> [String: Any?]? {
    guard let bleId, let transport = BoardTransport.decode(storedTransport)?.bridgeValue else { return nil }
    var built: [String: Any?] = ["bleId": bleId, "transport": transport]
    built["linkVersion"] = values["linkVersion"] as? Int ?? version
    if let hasBms = values["hasBms"] as? Bool { built["hasBms"] = hasBms }
    for key in stringIdentityKeys {
      if let value = values[key] as? String { built[key] = value }
    }
    built["linkIntegrity"] = normalizedLinkIntegrity(values)
    return built
  }

  static func settings(from rawLink: Any?) -> [(String, Any?)] {
    let link = normalized(rawLink)
    let transport = BoardTransport.encode(BoardTransport.fromBridge(link?["transport"] ?? nil))
    let linkIntegrity = link.flatMap { $0["linkIntegrity"] as? String ?? "unknown" }
    return [
      ("linkVersion", (intValue(link?["linkVersion"] ?? nil) == version) ? version : nil),
      ("hasBms", link?["hasBms"] as? Bool),
      ("vescFirmwareVersion", (link?["vescFirmwareVersion"] as? String).flatMap { $0.isEmpty ? nil : $0 }),
      ("refloatVersion", (link?["refloatVersion"] as? String).flatMap { $0.isEmpty ? nil : $0 }),
      ("refloatBaseVersion", (link?["refloatBaseVersion"] as? String).flatMap { $0.isEmpty ? nil : $0 }),
      ("linkIntegrity", linkIntegrity),
      ("transport", transport),
    ]
  }

  private static func normalizedLinkIntegrity(_ values: [String: Any]) -> String {
    let version = values["linkVersion"] as? Int
    if version == Self.version && identityKeys.allSatisfy({ values[$0] != nil }) {
      return values["linkIntegrity"] as? String ?? "unknown"
    }
    return "outdated"
  }

  private static func intValue(_ raw: Any?) -> Int? {
    switch raw {
    case let value as Int: return value
    case let value as NSNumber: return value.intValue
    default: return nil
    }
  }
}
