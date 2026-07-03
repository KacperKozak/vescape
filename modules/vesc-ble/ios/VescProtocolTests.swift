import XCTest
@testable import VescBle

final class VescProtocolTests: XCTestCase {
  func testBuildsRemoteTiltChuckCommand() {
    XCTAssertEqual(
      [UInt8(COMM_SET_CHUCK_DATA), 0, 127],
      buildRemoteTiltCommand(transport: .direct, value: 128)
    )
  }

  func testFramesRemoteTiltChuckForCan() {
    XCTAssertEqual(
      [UInt8(COMM_FORWARD_CAN), 7, UInt8(COMM_SET_CHUCK_DATA), 0, 0],
      buildRemoteTiltCommand(transport: .can(7), value: 255)
    )
  }

  func testParsesFirmwareVersionPayloads() {
    XCTAssertNil(parseFwVersion(payload: [UInt8(COMM_FW_VERSION), 6]))
    XCTAssertEqual("FW 6.05", parseFwVersion(payload: [UInt8(COMM_FW_VERSION), 6, 5]))
    XCTAssertEqual(
      "FW 6.05 · VESC Express · Refloat, Float Package",
      parseFwVersion(payload: fwVersionPayload("VESC Express", "Refloat", "Float Package"))
    )
  }

  func testToleratesTruncatedFirmwareCustomConfigTail() {
    let payload = Array(fwVersionPayload("VESC", "Refloat").prefix(3 + 4 + 1 + 15 + 1 + 4))

    XCTAssertEqual("FW 6.05 · VESC · Refl", parseFwVersion(payload: payload))
  }

  func testBuildsShortPacketWithCrc() {
    let payload = [UInt8(COMM_CUSTOM_APP_DATA), UInt8(REFLOAT_MAGIC), UInt8(REFLOAT_GET_ALLDATA), 2]

    XCTAssertEqual(
      [0x02, 0x04, 0x24, 0x65, 0x0a, 0x02, 0x42, 0xad, 0x03],
      VescPacketCodec.buildPacket(payload)
    )
  }

  func testBuildsLongPacketWithCrc() {
    let payload = Array(repeating: UInt8(COMM_PING_CAN), count: 300)
    let frame = VescPacketCodec.buildPacket(payload)

    XCTAssertEqual(0x03, frame[0])
    XCTAssertEqual(0x01, frame[1])
    XCTAssertEqual(0x2c, frame[2])
    XCTAssertEqual(306, frame.count)
    XCTAssertEqual(0x37, frame[303])
    XCTAssertEqual(0x34, frame[304])
    XCTAssertEqual(0x03, frame[305])
  }

  func testCodecRoundTripsSplitFrameThroughReassembler() {
    let payload = [UInt8(COMM_CUSTOM_APP_DATA), UInt8(REFLOAT_MAGIC), UInt8(REFLOAT_GET_ALLDATA), 2]
    let frame = VescPacketCodec.encode(payload)
    let reassembler = VescPacketReassembler()

    XCTAssertTrue(reassembler.feed(Array(frame.prefix(3))).isEmpty)
    let packets = reassembler.feed(Array(frame.dropFirst(3)))

    XCTAssertEqual(1, packets.count)
    XCTAssertEqual(payload, packets.first)
  }

  func testReassemblerDropsNoiseAndBadCrcBeforeValidPacket() {
    let payload = [UInt8(COMM_PING_CAN)]
    let valid = VescPacketCodec.buildPacket(payload)
    let corrupted = [UInt8](valid.dropLast()) + [0x00]
    let reassembler = VescPacketReassembler()

    let packets = reassembler.feed([0xff, 0x00] + corrupted + valid)

    XCTAssertEqual([payload], packets)
  }

  func testCommandConstantsAndNusUuidsMatchAndroidProtocol() {
    XCTAssertEqual(0, COMM_FW_VERSION)
    XCTAssertEqual(34, COMM_FORWARD_CAN)
    XCTAssertEqual(36, COMM_CUSTOM_APP_DATA)
    XCTAssertEqual(62, COMM_PING_CAN)
    XCTAssertEqual(96, COMM_BMS_GET_VALUES)
    XCTAssertEqual("6E400001-B5A3-F393-E0A9-E50E24DCCA9E", VescUartUUIDs.service.uuidString)
    XCTAssertEqual("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", VescUartUUIDs.tx.uuidString)
    XCTAssertEqual("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", VescUartUUIDs.rx.uuidString)
  }

  private func fwVersionPayload(_ hardwareName: String, _ customConfigs: String...) -> [UInt8] {
    var bytes: [UInt8] = [UInt8(COMM_FW_VERSION), 6, 5]
    bytes.append(contentsOf: hardwareName.utf8)
    bytes.append(0)
    bytes.append(contentsOf: Array(repeating: 0, count: 15))
    bytes.append(UInt8(customConfigs.count))
    for config in customConfigs {
      bytes.append(contentsOf: config.utf8)
      bytes.append(0)
    }
    return bytes
  }
}
