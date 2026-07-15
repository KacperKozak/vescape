import CryptoKit
import Foundation

struct RefloatConfigDecodeException: Error {
  let message: String
  init(_ message: String) { self.message = message }
}

/// Decodes raw Refloat config bytes into the Android-identical snapshot bridge shape.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/RefloatConfigDecoder.kt
enum RefloatConfigDecoder {
  static func decode(
    schema: RefloatConfigSchema,
    rawConfig: [UInt8],
    boardId: String?,
    canId: Int?,
    capturedAt: Int64,
    fwVersion: String?,
    refloatVersion: String? = nil
  ) throws -> RefloatConfigSnapshot {
    let byId = Dictionary(uniqueKeysWithValues: schema.fields.map { ($0.id, $0) })
    let requiredLength = schema.fields.map { $0.offset + $0.type.byteSize }.max() ?? 0
    if rawConfig.count < requiredLength {
      throw RefloatConfigDecodeException("CONFIG_DECODE_FAILED: config length \(rawConfig.count) < \(requiredLength)")
    }

    var missing: [String] = []
    var groups: [RefloatConfigGroup] = []
    for groupDef in REFLOAT_TUNE_GROUPS {
      var fields: [RefloatConfigField] = []
      for fieldDef in groupDef.fields {
        guard let schemaField = byId[fieldDef.id] else {
          missing.append(fieldDef.id)
          continue
        }
        fields.append(
          RefloatConfigField(
            id: fieldDef.id,
            label: schemaField.label.isEmpty ? fieldDef.label : schemaField.label,
            value: try readValue(rawConfig, schemaField),
            unit: schemaField.unit ?? fieldDef.unitFallback,
            min: schemaField.min,
            max: schemaField.max
          )
        )
      }
      if !fields.isEmpty { groups.append(RefloatConfigGroup(id: groupDef.id, title: groupDef.title, fields: fields)) }
    }

    return RefloatConfigSnapshot(
      capturedAt: capturedAt,
      boardId: boardId,
      canId: canId,
      schemaHash: schema.hash,
      rawConfigHash: sha256(rawConfig),
      rawConfigLength: rawConfig.count,
      groups: groups,
      missingFieldIds: missing,
      fwVersion: fwVersion,
      refloatVersion: refloatVersion
    )
  }

  /// Decode just the fields the config-safety rules need. Each is `nil` when the schema lacks it or
  /// the raw config is too short — the caller skips the rules that depend on a missing value.
  static func decodeSafetyValues(schema: RefloatConfigSchema, rawConfig: [UInt8]) -> ConfigSafetyValues {
    let byId = Dictionary(uniqueKeysWithValues: schema.fields.map { ($0.id, $0) })
    func fieldOrNull(_ id: String) -> RefloatConfigSchemaField? {
      guard let field = byId[id], rawConfig.count >= field.offset + field.type.byteSize else { return nil }
      return field
    }
    func number(_ id: String) -> Double? {
      guard let field = fieldOrNull(id), let value = try? readValue(rawConfig, field) else { return nil }
      if let d = value as? Double { return d }
      if let b = value as? Bool { return b ? 1.0 : 0.0 }
      return nil
    }
    func boolean(_ id: String) -> Bool? {
      guard let field = fieldOrNull(id), let value = try? readValue(rawConfig, field) else { return nil }
      return value as? Bool
    }
    return ConfigSafetyValues(
      faultAdc1: number("fault_adc1"),
      faultAdc2: number("fault_adc2"),
      tiltbackLv: number("tiltback_lv"),
      tiltbackHv: number("tiltback_hv"),
      tiltbackDuty: number("tiltback_duty"),
      movingFaultDisabled: boolean("fault_moving_fault_disabled")
    )
  }

  private static func readValue(_ bytes: [UInt8], _ field: RefloatConfigSchemaField) throws -> Any {
    switch field.type {
    case .float32:
      return Double(Float(bitPattern: readUInt32(bytes, field.offset)))
    case .float32Scaled:
      let scale = try requireScale(field)
      return Double(Int32(bitPattern: readUInt32(bytes, field.offset))) / scale
    case .float32Auto:
      return float32Auto(bytes, field.offset)
    case .float16Scaled:
      let scale = try requireScale(field)
      return Double(Int16(bitPattern: readUInt16(bytes, field.offset))) / scale
    case .int32:
      return Double(Int32(bitPattern: readUInt32(bytes, field.offset)))
    case .uint32:
      return Double(readUInt32(bytes, field.offset))
    case .int16:
      return Double(Int16(bitPattern: readUInt16(bytes, field.offset)))
    case .uint16:
      return Double(readUInt16(bytes, field.offset))
    case .int8:
      return Double(Int8(bitPattern: bytes[field.offset]))
    case .uint8:
      return Double(bytes[field.offset])
    case .bool:
      return bytes[field.offset] != 0
    }
  }

  private static func requireScale(_ field: RefloatConfigSchemaField) throws -> Double {
    guard let scale = field.scale else {
      throw RefloatConfigDecodeException("CONFIG_DECODE_FAILED: missing scale for \(field.id)")
    }
    return scale
  }

  private static func float32Auto(_ bytes: [UInt8], _ offset: Int) -> Double {
    let raw = readUInt32(bytes, offset)
    let eRaw = (raw >> 23) & 0xff
    let sigI = raw & 0x7fffff
    let neg = (raw >> 31) != 0
    if eRaw == 0 && sigI == 0 { return 0.0 }
    let sig = Double(sigI) / (8_388_608.0 * 2.0) + 0.5
    let result = sig * pow(2.0, Double(Int(eRaw) - 126))
    return neg ? -result : result
  }

  private static func readUInt16(_ bytes: [UInt8], _ offset: Int) -> UInt16 {
    (UInt16(bytes[offset]) << 8) | UInt16(bytes[offset + 1])
  }

  private static func readUInt32(_ bytes: [UInt8], _ offset: Int) -> UInt32 {
    (UInt32(bytes[offset]) << 24)
      | (UInt32(bytes[offset + 1]) << 16)
      | (UInt32(bytes[offset + 2]) << 8)
      | UInt32(bytes[offset + 3])
  }

  private static func sha256(_ bytes: [UInt8]) -> String {
    SHA256.hash(data: Data(bytes)).map { String(format: "%02x", $0) }.joined()
  }
}
