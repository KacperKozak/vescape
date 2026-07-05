import Foundation

/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescProtocol.kt
private let REFLOAT_FAULT_MODE = 69
internal let COMM_FW_VERSION = 0
internal let COMM_FORWARD_CAN = 34
internal let COMM_CUSTOM_APP_DATA = 36
internal let COMM_BMS_GET_VALUES = 96
internal let COMM_GET_CUSTOM_CONFIG_XML = 92
internal let COMM_GET_CUSTOM_CONFIG = 93
internal let COMM_SET_CUSTOM_CONFIG = 95
internal let COMM_PING_CAN = 62
internal let COMM_SET_CHUCK_DATA = 35
internal let REFLOAT_MAGIC = 101
internal let REFLOAT_GET_INFO = 0
internal let REFLOAT_GET_ALLDATA = 10
internal let REMOTE_TILT_CENTER = 128

internal enum VescUartUUIDs {
  static let service = UUID(uuidString: "6e400001-b5a3-f393-e0a9-e50e24dcca9e")!
  static let tx = UUID(uuidString: "6e400002-b5a3-f393-e0a9-e50e24dcca9e")!
  static let rx = UUID(uuidString: "6e400003-b5a3-f393-e0a9-e50e24dcca9e")!
}

/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/BoardTransport.kt
/// Persisted form (`boards.transport` TEXT scalar): `null` | `"direct"` | `"<canId>"`.
/// Bridge form (JS): `null` | `"direct"` | Int.
internal enum BoardTransport: Equatable {
  case direct
  case can(Int)

  func frame(_ command: [UInt8]) -> [UInt8] {
    switch self {
    case .direct:
      return command
    case .can(let canId):
      precondition((0...255).contains(canId), "CAN id must be between 0 and 255")
      return [UInt8(COMM_FORWARD_CAN), UInt8(canId)] + command
    }
  }

  /// Wire scalar for JS: `"direct"` or a CAN id. Mirrors `BoardTransport.toBridge`.
  var bridgeValue: Any {
    switch self {
    case .direct: return "direct"
    case .can(let canId): return canId
    }
  }

  /// Coerce a bridge value coming from JS (`null` | `"direct"` | Number). Junk → `nil`
  /// (undetected). Mirrors Android `BoardTransport.fromBridge`.
  static func fromBridge(_ value: Any?) -> BoardTransport? {
    switch value {
    case let text as String where text == "direct":
      return .direct
    case let number as NSNumber:
      let canId = number.intValue
      return (0...255).contains(canId) ? .can(canId) : nil
    default:
      return nil
    }
  }

  /// Decode the persisted TEXT column. Junk decodes to `nil` (undetected).
  /// Mirrors Android `BoardTransport.decode`.
  static func decode(_ stored: String?) -> BoardTransport? {
    switch stored {
    case nil:
      return nil
    case "direct":
      return .direct
    case let text?:
      guard let canId = Int(text), (0...255).contains(canId) else { return nil }
      return .can(canId)
    }
  }

  /// Encode to the persisted TEXT column. Mirrors Android `BoardTransport.encode`.
  static func encode(_ transport: BoardTransport?) -> String? {
    switch transport {
    case nil: return nil
    case .direct: return "direct"
    case .can(let canId): return String(canId)
    }
  }
}

internal func buildRemoteTiltCommand(transport: BoardTransport, value: Int) -> [UInt8] {
  precondition((0...255).contains(value), "Remote tilt value must be between 0 and 255")
  return transport.frame([
    UInt8(COMM_SET_CHUCK_DATA),
    0,
    UInt8(255 - value),
  ])
}

internal func parseFwVersion(payload: [UInt8]) -> String? {
  guard payload.count >= 3 else { return nil }
  let major = Int(payload[1])
  let minor = Int(payload[2])
  var hardwareNameEnd = 3
  while hardwareNameEnd < payload.count && payload[hardwareNameEnd] != 0 {
    hardwareNameEnd += 1
  }

  let hardwareName: String?
  if hardwareNameEnd > 3 {
    hardwareName = String(bytes: payload[3..<hardwareNameEnd], encoding: .utf8)
  } else {
    hardwareName = nil
  }

  var offset = hardwareNameEnd + 1 + 15
  var customConfigs: [String] = []
  if offset < payload.count {
    let count = Int(payload[offset])
    offset += 1
    for _ in 0..<count {
      let start = offset
      while offset < payload.count && payload[offset] != 0 {
        offset += 1
      }
      if offset > start, let config = String(bytes: payload[start..<offset], encoding: .utf8) {
        customConfigs.append(config)
      }
      offset += 1
    }
  }

  var parts = ["FW \(major).\(String(format: "%02d", minor))"]
  if let hardwareName {
    parts.append(hardwareName)
  }
  if !customConfigs.isEmpty {
    parts.append(customConfigs.joined(separator: ", "))
  }
  return parts.joined(separator: " · ")
}

internal enum VescPacketCodec {
  static func buildPacket(_ payload: [UInt8]) -> [UInt8] {
    let short = payload.count <= 255
    var frame: [UInt8] = []
    frame.reserveCapacity((short ? 2 : 3) + payload.count + 3)

    if short {
      frame.append(0x02)
      frame.append(UInt8(payload.count))
    } else {
      frame.append(0x03)
      frame.append(UInt8((payload.count >> 8) & 0xff))
      frame.append(UInt8(payload.count & 0xff))
    }

    frame.append(contentsOf: payload)
    let crc = crc16(payload)
    frame.append(UInt8((crc >> 8) & 0xff))
    frame.append(UInt8(crc & 0xff))
    frame.append(0x03)
    return frame
  }

  static func encode(_ payload: [UInt8]) -> [UInt8] {
    buildPacket(payload)
  }

  static func parsePacket(_ frame: [UInt8]) -> [UInt8]? {
    guard let packet = VescPacketReassembler().feed(frame).first else {
      return nil
    }
    return packet
  }

  static func crc16(_ data: [UInt8]) -> UInt16 {
    var crc = 0
    for byte in data {
      crc ^= Int(byte) << 8
      for _ in 0..<8 {
        if (crc & 0x8000) != 0 {
          crc = ((crc << 1) ^ 0x1021) & 0xffff
        } else {
          crc = (crc << 1) & 0xffff
        }
      }
    }
    return UInt16(crc & 0xffff)
  }
}

internal final class VescPacketReassembler {
  private var buffer: [UInt8] = []

  func reset() {
    buffer.removeAll()
  }

  func feed(_ chunk: [UInt8]) -> [[UInt8]] {
    buffer.append(contentsOf: chunk)
    var packets: [[UInt8]] = []

    while !buffer.isEmpty {
      let start = buffer[0]
      if start != 0x02 && start != 0x03 {
        buffer.removeFirst()
        continue
      }

      let headerLength = start == 0x02 ? 2 : 3
      guard buffer.count >= headerLength else { break }

      let length: Int
      if start == 0x02 {
        length = Int(buffer[1])
      } else {
        length = (Int(buffer[1]) << 8) | Int(buffer[2])
      }

      let total = headerLength + length + 3
      guard buffer.count >= total else { break }

      guard buffer[total - 1] == 0x03 else {
        buffer.removeFirst()
        continue
      }

      let payload = Array(buffer[headerLength..<(headerLength + length)])
      let actualCrc = (UInt16(buffer[headerLength + length]) << 8) | UInt16(buffer[headerLength + length + 1])
      if VescPacketCodec.crc16(payload) == actualCrc {
        packets.append(payload)
        buffer.removeFirst(total)
      } else {
        buffer.removeFirst()
      }
    }

    return packets
  }
}

// MARK: - Refloat telemetry decode

/// One decoded Refloat `GET_ALLDATA` telemetry frame. Mirrors Android `RefloatTelemetry`.
internal struct RefloatTelemetry {
  let hasFault: Bool
  let faultCode: Int
  let pitch: Double
  let roll: Double
  let balancePitch: Double
  let balanceCurrent: Double
  let speed: Double
  let batteryVoltage: Double
  let motorCurrent: Double
  let batteryCurrent: Double
  let erpm: Int
  let dutyCycle: Double
  let state: Int
  let switchState: Int
  let adc1: Double
  let adc2: Double
  let odometer: Double?
  let tempMosfet: Double?
  let tempMotor: Double?
  let avgLatency: Int?
  let pullRateHz: Double?
  let lastPacketAt: Int64

  /// Bridge shape matching the TS `TelemetryEvent`. `location` is omitted here (added by
  /// higher layers when GPS lands); the hot-path live tick never carries it.
  func toMap() -> [String: Any?] {
    [
      "hasFault": hasFault,
      "faultCode": faultCode,
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
      "state": state,
      "stateName": stateName(state),
      "switchState": switchState,
      "adc1": adc1,
      "adc2": adc2,
      "odometer": odometer,
      "tempMosfet": tempMosfet,
      "tempMotor": tempMotor,
      "avgLatency": avgLatency,
      "pullRateHz": pullRateHz,
      "lastPacketAt": lastPacketAt,
    ]
  }
}

/// Decode a Refloat `COMM_CUSTOM_APP_DATA` / `GET_ALLDATA` telemetry reply. Returns `nil` for
/// unrelated payloads or truncated frames. Mirrors Android `parseRefloatGetAllData`.
internal func parseRefloatGetAllData(
  payload: [UInt8],
  avgLatency: Int?,
  packetAt: Int64,
  pullRateHz: Double?
) -> RefloatTelemetry? {
  if payload.count < 5 { return nil }
  if Int(payload[0]) != COMM_CUSTOM_APP_DATA { return nil }
  if Int(payload[1]) != REFLOAT_MAGIC { return nil }
  if Int(payload[2]) != REFLOAT_GET_ALLDATA { return nil }

  let mode = Int(payload[3])
  if mode == REFLOAT_FAULT_MODE {
    return RefloatTelemetry(
      hasFault: true,
      faultCode: payload.count > 4 ? Int(payload[4]) : 0,
      pitch: 0.0,
      roll: 0.0,
      balancePitch: 0.0,
      balanceCurrent: 0.0,
      speed: 0.0,
      batteryVoltage: 0.0,
      motorCurrent: 0.0,
      batteryCurrent: 0.0,
      erpm: 0,
      dutyCycle: 0.0,
      state: 0,
      switchState: 0,
      adc1: 0.0,
      adc2: 0.0,
      odometer: nil,
      tempMosfet: nil,
      tempMotor: nil,
      avgLatency: avgLatency,
      pullRateHz: pullRateHz,
      lastPacketAt: packetAt
    )
  }
  if payload.count < 34 { return nil }

  let hasExtended = mode >= 2 && payload.count >= 42
  let dutyRaw = Int(payload[33]) - 128
  let dutyCycle = abs(dutyRaw) <= 1 ? 0.0 : Double(dutyRaw) / 100.0
  return RefloatTelemetry(
    hasFault: false,
    faultCode: 0,
    pitch: Double(int16(payload, 20)) / 10.0,
    roll: Double(int16(payload, 8)) / 10.0,
    balancePitch: Double(int16(payload, 6)) / 10.0,
    balanceCurrent: Double(int16(payload, 4)) / 10.0,
    speed: (Double(int16(payload, 27)) / 10.0) * 3.6,
    batteryVoltage: Double(int16(payload, 23)) / 10.0,
    motorCurrent: Double(int16(payload, 29)) / 10.0,
    batteryCurrent: Double(int16(payload, 31)) / 10.0,
    erpm: int16(payload, 25),
    dutyCycle: dutyCycle,
    state: Int(payload[10]),
    switchState: Int(payload[11]),
    adc1: Double(payload[12]) / 50.0,
    adc2: Double(payload[13]) / 50.0,
    odometer: hasExtended ? float32Auto(payload, 35) : nil,
    tempMosfet: hasExtended ? Double(payload[39]) / 2.0 : nil,
    tempMotor: hasExtended ? Double(payload[40]) / 2.0 : nil,
    avgLatency: avgLatency,
    pullRateHz: pullRateHz,
    lastPacketAt: packetAt
  )
}

/// One decoded smart-BMS `COMM_BMS_GET_VALUES` snapshot. Mirrors Android `BmsTelemetry`.
internal struct BmsTelemetry {
  let capturedAt: Int64
  let voltageTotal: Double
  let current: Double
  let ampHours: Double
  let wattHours: Double
  let soc: Double?
  let cellVoltages: [Double]
  let balancing: [Bool]

  /// Bridge shape matching the TS `BmsEvent`. Mirrors Android `BmsTelemetry.toMap`.
  func toMap() -> [String: Any?] {
    [
      "capturedAt": capturedAt,
      "voltageTotal": voltageTotal,
      "current": current,
      "ampHours": ampHours,
      "wattHours": wattHours,
      "soc": soc,
      "cellVoltages": cellVoltages,
      "balancing": balancing,
    ]
  }
}

/// Decode a `COMM_BMS_GET_VALUES` reply from a VESC-attached smart BMS.
///
/// The VESC firmware packs scaled big-endian integers (not IEEE floats): float32 fields are
/// `int32 / scale`, float16 fields are `int16 / scale`. Layout mirrors `commands.c`:
///   v_tot, v_charge, i_in, i_in_ic (float32 1e6) · ah_cnt, wh_cnt (float32 1e3) ·
///   cell_num (u8) · v_cell[cell_num] (float16 1e3) · bal_state[cell_num] (u8) ·
///   temp_adc_num (u8) · temps_adc[] (float16 1e2) · temp_ic/temp_hum/hum/temp_max_cell (float16 1e2) ·
///   soc (u8 ×255) · soh (u8 ×255) · can_id (u8) ...
///
/// Only the stable prefix (voltages + balancing) is required; soc is best-effort so firmware
/// variants with different trailing fields still yield cell data. A non-nil result also proves a
/// real BMS answered — the Board Probe uses that as the `hasBms` capability signal.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescProtocol.kt (parseBmsValues)
internal func parseBmsValues(_ payload: [UInt8], packetAt: Int64) -> BmsTelemetry? {
  guard !payload.isEmpty else { return nil }
  guard Int(payload[0]) == COMM_BMS_GET_VALUES else { return nil }
  guard payload.count >= 26 else { return nil }

  var ind = 1
  let voltageTotal = Double(int32(payload, ind)) / 1e6; ind += 4
  /* v_charge */ ind += 4
  let current = Double(int32(payload, ind)) / 1e6; ind += 4
  /* i_in_ic */ ind += 4
  let ampHours = Double(int32(payload, ind)) / 1e3; ind += 4
  let wattHours = Double(int32(payload, ind)) / 1e3; ind += 4

  let cellNum = Int(payload[ind]); ind += 1
  guard cellNum > 0, cellNum <= 60 else { return nil }
  guard payload.count >= ind + cellNum * 2 else { return nil }

  var cellVoltages = [Double](repeating: 0, count: cellNum)
  for i in 0..<cellNum {
    cellVoltages[i] = Double(int16(payload, ind)) / 1e3
    ind += 2
  }

  var balancing = [Bool](repeating: false, count: cellNum)
  if payload.count >= ind + cellNum {
    for i in 0..<cellNum {
      balancing[i] = payload[ind] != 0
      ind += 1
    }
  }

  var soc: Double?
  if payload.count > ind {
    let tempAdcNum = Int(payload[ind])
    // temp_adc_num + temps_adc[] + temp_ic + temp_hum + hum + temp_max_cell
    let socIndex = ind + 1 + tempAdcNum * 2 + 8
    if socIndex < payload.count {
      soc = Double(payload[socIndex]) / 255.0
    }
  }

  return BmsTelemetry(
    capturedAt: packetAt,
    voltageTotal: voltageTotal,
    current: current,
    ampHours: ampHours,
    wattHours: wattHours,
    soc: soc,
    cellVoltages: cellVoltages,
    balancing: balancing
  )
}

/// Refloat/Float package board state → wire label. Mirrors Android `stateName`.
internal func stateName(_ state: Int) -> String {
  switch state & 0x0f {
  case 0: return "STARTUP"
  case 1: return "RUNNING"
  case 2: return "TILTBACK"
  case 3: return "WHEELSLIP"
  case 4: return "UPSIDEDOWN"
  case 5: return "FLYWHEEL"
  case 6: return "FAULT_PITCH"
  case 7: return "FAULT_ROLL"
  case 8: return "FAULT_SW_HALF"
  case 9: return "FAULT_SW_FULL"
  case 11: return "FAULT_STARTUP"
  case 12: return "FAULT_REVERSE"
  case 13: return "FAULT_QUICKSTOP"
  case 14: return "CHARGING"
  case 15: return "DISABLED"
  default: return "UNKNOWN"
  }
}

private func int16(_ bytes: [UInt8], _ offset: Int) -> Int {
  let raw = (Int(bytes[offset]) << 8) | Int(bytes[offset + 1])
  return raw >= 0x8000 ? raw - 0x10000 : raw
}

private func int32(_ bytes: [UInt8], _ offset: Int) -> Int {
  let raw = (UInt32(bytes[offset]) << 24) | (UInt32(bytes[offset + 1]) << 16)
    | (UInt32(bytes[offset + 2]) << 8) | UInt32(bytes[offset + 3])
  return Int(Int32(bitPattern: raw))
}

private func float32Auto(_ bytes: [UInt8], _ offset: Int) -> Double {
  let raw = (UInt32(bytes[offset]) << 24) | (UInt32(bytes[offset + 1]) << 16)
    | (UInt32(bytes[offset + 2]) << 8) | UInt32(bytes[offset + 3])
  let eRaw = Int((raw >> 23) & 0xff)
  let sigI = Int(raw & 0x7fffff)
  let negative = (raw >> 31) != 0
  if eRaw == 0 && sigI == 0 { return 0.0 }
  let significand = Double(sigI) / (8388608.0 * 2.0) + 0.5
  let result = significand * pow(2.0, Double(eRaw - 126))
  return negative ? -result : result
}
