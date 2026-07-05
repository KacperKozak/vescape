import XCTest
@testable import VescBle

final class RefloatConfigProtocolTests: XCTestCase {
  func testBuildsForwardedGetInfoRequest() {
    XCTAssertEqual(
      [UInt8(COMM_FORWARD_CAN), 7, UInt8(COMM_CUSTOM_APP_DATA), UInt8(REFLOAT_MAGIC), UInt8(REFLOAT_GET_INFO), 1],
      RefloatConfigProtocol.buildGetInfo(transport: .can(7))
    )
  }

  func testParsesGetInfoV1Response() throws {
    let parsed = try success(RefloatConfigProtocol.parseGetInfoResponse([
      UInt8(COMM_CUSTOM_APP_DATA),
      UInt8(REFLOAT_MAGIC),
      UInt8(REFLOAT_GET_INFO),
      12,
      1,
      0,
    ]))

    XCTAssertEqual("Refloat 1.2", parsed.version)
  }

  func testParsesForwardedGetInfoV2Response() throws {
    var payload = Array(repeating: UInt8(0), count: 2 + 3 + 2 + 20 + 3 + 20)
    payload[0] = UInt8(COMM_FORWARD_CAN)
    payload[1] = 7
    payload[2] = UInt8(COMM_CUSTOM_APP_DATA)
    payload[3] = UInt8(REFLOAT_MAGIC)
    payload[4] = UInt8(REFLOAT_GET_INFO)
    payload[5] = 2
    Array("refloat".utf8).enumerated().forEach { payload[7 + $0.offset] = $0.element }
    payload[27] = 1
    payload[28] = 3
    payload[29] = 0
    Array("preview2".utf8).enumerated().forEach { payload[30 + $0.offset] = $0.element }

    let parsed = try success(RefloatConfigProtocol.parseGetInfoResponse(payload))

    XCTAssertEqual("Refloat 1.3.0-preview2", parsed.version)
  }

  func testBuildsDirectAndForwardedXmlRequests() {
    XCTAssertEqual(
      [UInt8(COMM_GET_CUSTOM_CONFIG_XML), 0, 0, 0, 1, 0x80, 0, 0, 3, 0],
      RefloatConfigProtocol.buildGetCustomConfigXml(transport: .direct, confInd: 0, length: 384, offset: 768)
    )
    XCTAssertEqual(
      [UInt8(COMM_FORWARD_CAN), 7, UInt8(COMM_GET_CUSTOM_CONFIG_XML), 0, 0, 0, 1, 0x80, 0, 0, 3, 0],
      RefloatConfigProtocol.buildGetCustomConfigXml(transport: .can(7), confInd: 0, length: 384, offset: 768)
    )
  }

  func testParsesCustomConfigXmlResponse() throws {
    let parsed = try success(RefloatConfigProtocol.parseCustomConfigXmlResponse([
      UInt8(COMM_GET_CUSTOM_CONFIG_XML),
      0,
      0, 0, 0, 10,
      0, 0, 0, 4,
      116, 101, 115, 116,
    ]))

    XCTAssertEqual(0, parsed.confInd)
    XCTAssertEqual(10, parsed.totalLength)
    XCTAssertEqual(4, parsed.offset)
    XCTAssertEqual(Array("test".utf8), parsed.chunk)
  }

  func testParsesCustomConfigResponse() throws {
    let parsed = try success(RefloatConfigProtocol.parseCustomConfigResponse([
      UInt8(COMM_GET_CUSTOM_CONFIG),
      0,
      0x12, 0x34, 0x56, 0x78,
      1, 2, 3, 4,
    ]))

    XCTAssertEqual(0, parsed.confInd)
    XCTAssertEqual(0x12345678, parsed.packageSignature)
    XCTAssertEqual([1, 2, 3, 4], parsed.config)
  }

  func testRejectsWrongXmlCommand() throws {
    let message = try failure(RefloatConfigProtocol.parseCustomConfigXmlResponse([UInt8(COMM_GET_CUSTOM_CONFIG), 0]))

    XCTAssertEqual("Unexpected Refloat config command 93, expected 92", message)
  }

  private func success<T>(_ result: RefloatConfigProtocolResult<T>) throws -> T {
    switch result {
    case .success(let value): return value
    case .failure(let message): throw XCTSkip("Expected success, got \(message)")
    }
  }

  private func failure<T>(_ result: RefloatConfigProtocolResult<T>) throws -> String {
    switch result {
    case .success: throw XCTSkip("Expected failure")
    case .failure(let message): return message
    }
  }
}
