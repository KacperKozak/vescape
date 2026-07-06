import XCTest
import GRDB
@testable import VescBle

/// Data-integrity tests for the Tune Profile store, focused on the transactional history paths
/// (rollback + copy + save + safe delete) that mirror the Android DAO. Runs against an in-memory
/// GRDB database seeded with the same schema the app-data migrator installs.
final class TuneProfileStoreTests: XCTestCase {
  private var queue: DatabaseQueue!
  private var store: TuneProfileStore!

  override func setUpWithError() throws {
    queue = try DatabaseQueue()
    try queue.write { db in try TuneProfileStore.createTables(db) }
    store = TuneProfileStore(dbWriter: queue)
  }

  override func tearDownWithError() throws {
    store = nil
    queue = nil
  }

  private func fieldsOf(_ profile: [String: Any?]) -> [String: Any] {
    (profile["fields"] as? [String: Any]) ?? [:]
  }

  // MARK: - Create

  func testCreateSeedsProfileAndFirstHistoryEntry() throws {
    let profile = try store.createProfile(boardId: "board-1", name: "Race", fields: ["speed": 42])
    let id = profile["id"] as! String

    XCTAssertEqual(profile["boardId"] as? String, "board-1")
    XCTAssertEqual(profile["name"] as? String, "Race")
    XCTAssertEqual(fieldsOf(profile)["speed"] as? Int, 42)

    let history = store.getProfileHistory(id)
    XCTAssertEqual(history.count, 1)
    XCTAssertEqual((history[0]["fields"] as? [String: Any])?["speed"] as? Int, 42)
  }

  // MARK: - Save

  func testSaveAppendsHistoryOfPreviousFieldsThenUpdates() throws {
    let created = try store.createProfile(boardId: "board-1", name: "Race", fields: ["speed": 10])
    let id = created["id"] as! String

    let saved = try store.saveProfile(profileId: id, fields: ["speed": 20])
    XCTAssertEqual(fieldsOf(saved)["speed"] as? Int, 20)

    // History now has the seed (10) plus the pre-save snapshot (10), newest first.
    let history = store.getProfileHistory(id)
    XCTAssertEqual(history.count, 2)
    XCTAssertEqual((history[0]["fields"] as? [String: Any])?["speed"] as? Int, 10)
  }

  func testSaveOnMissingProfileThrowsNotFound() {
    XCTAssertThrowsError(try store.saveProfile(profileId: "nope", fields: [:])) { error in
      XCTAssertEqual((error as? TuneProfileError)?.errorDescription, "Tune Profile not found: nope")
    }
  }

  // MARK: - Rollback

  func testRollbackRestoresHistoryFieldsAndSnapshotsCurrent() throws {
    let created = try store.createProfile(boardId: "board-1", name: "Race", fields: ["speed": 10])
    let id = created["id"] as! String
    _ = try store.saveProfile(profileId: id, fields: ["speed": 99])

    // Oldest history entry holds the original speed=10 (seed).
    let historyBefore = store.getProfileHistory(id)
    let seedEntryId = historyBefore.last!["id"] as! Int64

    let restored = try store.rollbackProfile(profileId: id, historyEntryId: seedEntryId)
    XCTAssertEqual(fieldsOf(restored)["speed"] as? Int, 10)

    // Rollback appended a snapshot of the pre-rollback fields (99), so it stays reversible.
    let historyAfter = store.getProfileHistory(id)
    XCTAssertEqual(historyAfter.count, historyBefore.count + 1)
    XCTAssertEqual((historyAfter[0]["fields"] as? [String: Any])?["speed"] as? Int, 99)
  }

  func testRollbackWithMissingHistoryEntryThrows() throws {
    let created = try store.createProfile(boardId: "board-1", name: "Race", fields: ["speed": 10])
    let id = created["id"] as! String
    XCTAssertThrowsError(try store.rollbackProfile(profileId: id, historyEntryId: 9999)) { error in
      XCTAssertEqual((error as? TuneProfileError)?.errorDescription, "History entry not found: 9999")
    }
  }

  func testRollbackWithHistoryFromOtherProfileThrows() throws {
    let a = try store.createProfile(boardId: "board-1", name: "A", fields: ["speed": 1])
    let b = try store.createProfile(boardId: "board-1", name: "B", fields: ["speed": 2])
    let bHistoryId = store.getProfileHistory(b["id"] as! String)[0]["id"] as! Int64

    XCTAssertThrowsError(
      try store.rollbackProfile(profileId: a["id"] as! String, historyEntryId: bHistoryId)
    ) { error in
      XCTAssertEqual(
        (error as? TuneProfileError)?.errorDescription,
        "History entry does not belong to this profile"
      )
    }
  }

  // MARK: - Copy

  func testCopyToBoardClonesFieldsAndSeedsTargetHistory() throws {
    let source = try store.createProfile(boardId: "board-1", name: "Race", fields: ["speed": 55, "duty": 80])
    let sourceId = source["id"] as! String

    let copy = try store.copyProfileToBoard(profileId: sourceId, targetBoardId: "board-2", newName: "Race (copy)")
    let copyId = copy["id"] as! String

    XCTAssertNotEqual(copyId, sourceId)
    XCTAssertEqual(copy["boardId"] as? String, "board-2")
    XCTAssertEqual(copy["name"] as? String, "Race (copy)")
    XCTAssertEqual(fieldsOf(copy)["speed"] as? Int, 55)
    XCTAssertEqual(fieldsOf(copy)["duty"] as? Int, 80)

    // The copy lands on the target board and carries its own seeded history.
    XCTAssertEqual(store.getTuneProfiles("board-2").map { $0["id"] as! String }, [copyId])
    XCTAssertEqual(store.getProfileHistory(copyId).count, 1)
    // Source is untouched.
    XCTAssertEqual(store.getProfileHistory(sourceId).count, 1)
  }

  func testCopyMissingSourceThrows() {
    XCTAssertThrowsError(
      try store.copyProfileToBoard(profileId: "nope", targetBoardId: "board-2", newName: "x")
    ) { error in
      XCTAssertEqual((error as? TuneProfileError)?.errorDescription, "Source profile not found: nope")
    }
  }

  // MARK: - Delete

  func testDeleteRefusesLastProfileForBoard() throws {
    let only = try store.createProfile(boardId: "board-1", name: "Only", fields: [:])
    XCTAssertThrowsError(try store.deleteProfile(profileId: only["id"] as! String)) { error in
      XCTAssertEqual(
        (error as? TuneProfileError)?.errorDescription,
        "Cannot delete the last profile for a board"
      )
    }
  }

  func testDeleteRemovesProfileAndItsHistory() throws {
    _ = try store.createProfile(boardId: "board-1", name: "Keep", fields: [:])
    let victim = try store.createProfile(boardId: "board-1", name: "Drop", fields: [:])
    let victimId = victim["id"] as! String

    try store.deleteProfile(profileId: victimId)

    XCTAssertNil(store.getTuneProfile(victimId))
    XCTAssertTrue(store.getProfileHistory(victimId).isEmpty)
    XCTAssertEqual(store.getTuneProfiles("board-1").count, 1)
  }

  // MARK: - Rename

  func testRenameUpdatesNameAndThrowsWhenMissing() throws {
    let created = try store.createProfile(boardId: "board-1", name: "Old", fields: [:])
    let renamed = try store.renameProfile(profileId: created["id"] as! String, name: "New")
    XCTAssertEqual(renamed["name"] as? String, "New")

    XCTAssertThrowsError(try store.renameProfile(profileId: "nope", name: "x")) { error in
      XCTAssertEqual((error as? TuneProfileError)?.errorDescription, "Tune Profile not found: nope")
    }
  }
}
