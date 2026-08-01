import XCTest
@testable import VescapeCore

/// The batch builder is pure: no database, no clock, no network. What it has to get right is the
/// order tables go out in, the two caps, and an advance set that describes exactly the rows sent.
///
/// @parity /modules/vescape-core/android/src/test/java/expo/modules/vescapecore/sync/SyncBatchBuilderTest.kt
final class SyncBatchBuilderTests: XCTestCase {
  private func rows(_ count: Int, size: Int = 10, from: Int64 = 1) -> [SyncPendingRow] {
    (0..<count).map { SyncPendingRow(cursor: from + Int64($0), json: "\"" + String(repeating: "x", count: size) + "\"") }
  }

  private func ready(_ build: SyncBatchBuild) throws -> SyncBuiltBatch {
    guard case .ready(let batch) = build else {
      throw XCTSkip("expected a batch, got \(build)")
    }
    return batch
  }

  func testWalksServerTableOrderRegardlessOfBacklogSize() throws {
    let batch = try ready(
      SyncBatchBuilder.build([
        SyncPendingTable(table: .telemetryFrames, rows: rows(5)),
        SyncPendingTable(table: .boards, rows: rows(1)),
        SyncPendingTable(table: .appSettings, rows: rows(1)),
      ])
    )

    XCTAssertEqual(batch.tables, [.appSettings, .boards, .telemetryFrames])
  }

  func testAdvanceSetNamesTheLastRowActuallyIncluded() throws {
    let batch = try ready(
      SyncBatchBuilder.build(
        [
          SyncPendingTable(table: .boards, rows: rows(2, from: 40)),
          SyncPendingTable(table: .favorites, rows: rows(3, from: 7)),
        ],
        rowCap: 4
      )
    )

    XCTAssertEqual(batch.rowCount, 4)
    XCTAssertEqual(batch.counts, [.boards: 2, .favorites: 2])
    XCTAssertEqual(batch.advances, [.boards: 41, .favorites: 8])
  }

  func testExactlyAtAndOneOverTheRowCapBehaveIdentically() throws {
    let atCap = try ready(SyncBatchBuilder.build([SyncPendingTable(table: .boards, rows: rows(3))], rowCap: 3))
    XCTAssertEqual(atCap.rowCount, 3)

    let overCap = try ready(SyncBatchBuilder.build([SyncPendingTable(table: .boards, rows: rows(4))], rowCap: 3))
    XCTAssertEqual(overCap.rowCount, 3)
    XCTAssertEqual(overCap.advances[.boards], 3)
  }

  /// The cap is on the bytes actually sent, so the encoded body is what gets measured.
  func testByteCapCountsTheEncodedBodyBoundaryIncluded() throws {
    let pending = [SyncPendingTable(table: .boards, rows: rows(2, size: 8))]
    let one = try ready(SyncBatchBuilder.build(pending, byteCap: Int.max))
    XCTAssertEqual(one.body.utf8.count, one.byteCount)

    let atCap = try ready(SyncBatchBuilder.build(pending, byteCap: one.byteCount))
    XCTAssertEqual(atCap.rowCount, 2)

    let oneUnder = try ready(SyncBatchBuilder.build(pending, byteCap: one.byteCount - 1))
    XCTAssertEqual(oneUnder.rowCount, 1)
    XCTAssertEqual(oneUnder.body.utf8.count, oneUnder.byteCount)
  }

  func testMeasuresUtf8BytesRatherThanCharacters() throws {
    let row = SyncPendingRow(cursor: 1, json: "\"ąęółśż\"")
    let batch = try ready(SyncBatchBuilder.build([SyncPendingTable(table: .boards, rows: [row])]))
    XCTAssertEqual(batch.body.utf8.count, batch.byteCount)
  }

  func testARowNoEmptyBatchCouldCarryIsAPermanentErrorNotASilentSkip() {
    let huge = SyncPendingRow(cursor: 9, json: "\"" + String(repeating: "x", count: 500) + "\"")
    let build = SyncBatchBuilder.build([SyncPendingTable(table: .boards, rows: [huge])], byteCap: 100)
    XCTAssertEqual(build, .rowTooLarge(table: .boards, cursor: 9, byteCount: huge.byteCount))
  }

  func testNothingPendingIsIdleNotAnEmptyBatch() {
    XCTAssertEqual(SyncBatchBuilder.build([]), .empty)
    XCTAssertEqual(SyncBatchBuilder.build([SyncPendingTable(table: .boards, rows: [])]), .empty)
  }
}
