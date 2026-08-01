package expo.modules.vescapecore.sync

import expo.modules.vescapecore.telemetry.SYNC_ACTIONS_UPLOADED_CURSOR
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The two contracts the uploader cannot express in code alone: the cursor key each table commits
 * under, and the promise that retention deletes nothing the uploader has not delivered.
 *
 * Room keeps its SQL out of reach of a JVM test, so the retention half is asserted against the DAO
 * source — the same technique the Sync Action classification test uses.
 *
 * @parity /modules/vescape-core/ios/sync/SyncCursorContractTests.swift
 */
class SyncCursorContractTest {
  private fun daoSource(): String =
    File("src/main/java/expo/modules/vescapecore/telemetry/TelemetryDao.kt").readText()

  /** The retained tables, and the column whose cursor decides what may be pruned. */
  private val gatedSweeps = mapOf(
    "deleteFramesBeforeUpTo" to "id <= :cursor",
    "deleteMarkersBeforeUpTo" to "id <= :cursor",
    "deleteBucketsBeforeUpTo" to "sync_seq <= :cursor",
    "deleteDiagnosticEventsBeforeUpTo" to "id <= :cursor",
    "deleteExclusionsBeforeUpTo" to "id <= :cursor",
  )

  @Test
  fun `every retained table prunes only up to its accepted cursor`() {
    val source = daoSource()
    for ((name, predicate) in gatedSweeps) {
      val declaration = source.substringBefore("suspend fun $name")
      val query = declaration.substringAfterLast("@Query(")
      assertTrue("$name must gate on $predicate", query.contains(predicate))
      assertTrue("$name must still apply the age cutoff", query.contains("< :beforeMs"))
    }
  }

  /**
   * A mutable bucket is protected by `sync_seq`, not by its row id: a bucket rewritten after an
   * earlier version uploaded gets a fresh position and has to survive until that one is accepted.
   */
  @Test
  fun `minute buckets are gated on the counter their scan runs on`() {
    assertEquals(SYNC_SEQ_COLUMN, SyncTable.TELEMETRY_MINUTE_BUCKETS.cursorColumn)
    assertEquals(ROW_ID_COLUMN, SyncTable.TELEMETRY_FRAMES.cursorColumn)
  }

  @Test
  fun `cursor keys are namespaced away from the write counters`() {
    val keys = SyncTable.entries.map { it.cursorKey }
    assertEquals(keys.size, keys.toSet().size)
    for (table in SyncTable.entries - SyncTable.DELETE_ACTIONS) {
      assertEquals("$SYNC_CURSOR_PREFIX${table.table}", table.cursorKey)
    }
    // Sync Actions keep the key #282 shipped, so the log's prune reads what the uploader commits.
    assertEquals(SYNC_ACTIONS_UPLOADED_CURSOR, SyncTable.DELETE_ACTIONS.cursorKey)
  }

  /** Parents before children, and Delete Actions last: the order the server applies a batch in. */
  @Test
  fun `table order matches the server's declared batch order`() {
    assertEquals(
      listOf(
        "appSettings",
        "boards",
        "boardSettings",
        "boardWarnings",
        "alerts",
        "tuneProfiles",
        "tuneHistoryEntries",
        "privacyZones",
        "telemetryMarkers",
        "metricExclusionRanges",
        "diagnosticEvents",
        "telemetryFrames",
        "telemetryMinuteBuckets",
        "favorites",
        "deleteActions",
      ),
      SyncTable.entries.map { it.wire },
    )
  }
}
