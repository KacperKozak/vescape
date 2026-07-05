import XCTest
@testable import VescBle

final class RefloatConfigDecoderTests: XCTestCase {
  func testDecodesAllowlistedValuesIntoGroups() throws {
    let schema = RefloatConfigSchema(
      hash: "schema-hash",
      fields: [
        RefloatConfigSchemaField(id: "kp", type: .float32, label: "Angle P", unit: nil, min: 0, max: 100, offset: 0),
        RefloatConfigSchemaField(id: "kp2", type: .float32, label: "Rate P", unit: nil, min: 0, max: 5, offset: 4),
        RefloatConfigSchemaField(id: "unused", type: .int32, label: "Unused", unit: nil, min: nil, max: nil, offset: 8),
      ]
    )
    let bytes = float32Bytes(26.0) + float32Bytes(0.9) + int32Bytes(123)

    let snapshot = try RefloatConfigDecoder.decode(
      schema: schema,
      rawConfig: bytes,
      boardId: "board-1",
      canId: 7,
      capturedAt: 100,
      fwVersion: nil
    )

    XCTAssertEqual("schema-hash", snapshot.schemaHash)
    XCTAssertEqual(12, snapshot.rawConfigLength)
    XCTAssertEqual(26.0, snapshot.groups.first?.fields[0].value as? Double, accuracy: 0.001)
    XCTAssertEqual(0.9, snapshot.groups.first?.fields[1].value as? Double, accuracy: 0.001)
    XCTAssertFalse(snapshot.rawConfigHash.isEmpty)
  }

  func testRejectsTruncatedConfig() {
    let schema = RefloatConfigSchema(
      hash: "schema-hash",
      fields: [
        RefloatConfigSchemaField(id: "kp", type: .float32, label: "Angle P", unit: nil, min: 0, max: 100, offset: 0),
      ]
    )

    XCTAssertThrowsError(
      try RefloatConfigDecoder.decode(
        schema: schema,
        rawConfig: [1, 2],
        boardId: nil,
        canId: 7,
        capturedAt: 100,
        fwVersion: nil
      )
    )
  }

  func testDecodesWithNullCanIdForDirectConnection() throws {
    let schema = RefloatConfigSchema(
      hash: "schema-hash",
      fields: [
        RefloatConfigSchemaField(id: "kp", type: .float32, label: "Angle P", unit: nil, min: 0, max: 100, offset: 0),
      ]
    )

    let snapshot = try RefloatConfigDecoder.decode(
      schema: schema,
      rawConfig: float32Bytes(26.0),
      boardId: "board-1",
      canId: nil,
      capturedAt: 100,
      fwVersion: nil
    )

    XCTAssertNil(snapshot.canId)
    XCTAssertEqual("schema-hash", snapshot.schemaHash)
    XCTAssertEqual(4, snapshot.rawConfigLength)
  }

  private func float32Bytes(_ value: Float) -> [UInt8] {
    int32Bytes(Int32(bitPattern: value.bitPattern))
  }

  private func int32Bytes(_ value: Int32) -> [UInt8] {
    let raw = UInt32(bitPattern: value)
    return [
      UInt8((raw >> 24) & 0xff),
      UInt8((raw >> 16) & 0xff),
      UInt8((raw >> 8) & 0xff),
      UInt8(raw & 0xff),
    ]
  }
}
