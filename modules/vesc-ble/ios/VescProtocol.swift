import Foundation

/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescProtocol.kt
/// TODO(iOS parity): port Android telemetry/config/BMS decoders as iOS BLE transport lands.
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
/// TODO(iOS parity): add persisted/bridge transport encoding matching Android board storage.
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
