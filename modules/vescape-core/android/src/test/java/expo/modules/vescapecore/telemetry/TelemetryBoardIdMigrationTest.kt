package expo.modules.vescapecore.telemetry

import android.database.Cursor
import androidx.sqlite.db.SupportSQLiteDatabase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.lang.reflect.Proxy

/**
 * Telemetry keys on the Board id (#280, ADR 0028). Schema 34→35 adds `board_id` to
 * `telemetry_frames` and `telemetry_minute_buckets`, backfills it by matching `boards.ble_id`,
 * mints a tombstoned Board for every identifier that resolves to nothing, moves the bucket primary
 * key onto the new column, and drops `device_id` and `device_name` from both tables.
 *
 * Asserted against the emitted SQL rather than a live database: Room's `@Query` has BINARY
 * retention and this module's JVM test source set has no SQLite, the same constraint
 * [SyncCursorMigrationTest] works under. The behavioural half — actual rows after an actual
 * migration — runs on the GRDB peer, which does have an in-memory database.
 *
 * @parity /modules/vescape-core/ios/telemetry/TelemetryMigrationTests.swift
 */
class TelemetryBoardIdMigrationTest {
  private fun migrationSql(): List<String> {
    val sql = mutableListOf<String>()
    val db = Proxy.newProxyInstance(
      SupportSQLiteDatabase::class.java.classLoader,
      arrayOf(SupportSQLiteDatabase::class.java),
    ) { _, method, args ->
      when (method.name) {
        "execSQL" -> {
          sql += args?.firstOrNull() as String
          null
        }
        "query" -> emptyCursor()
        else -> throw UnsupportedOperationException(method.name)
      }
    } as SupportSQLiteDatabase
    TelemetryDatabase.MIGRATION_34_35.migrate(db)
    return sql
  }

  private fun emptyCursor(): Cursor = Proxy.newProxyInstance(
    Cursor::class.java.classLoader,
    arrayOf(Cursor::class.java),
  ) { _, method, _ ->
    when (method.name) {
      "getColumnIndex" -> 0
      "moveToNext" -> false
      "close" -> null
      else -> throw UnsupportedOperationException(method.name)
    }
  } as Cursor

  private fun daoSource(): String =
    File("src/main/java/expo/modules/vescapecore/telemetry/TelemetryDao.kt").readText()

  private fun statement(match: String): String =
    migrationSql().firstOrNull { it.contains(match) }
      ?: throw AssertionError("no migration statement contains `$match`")

  @Test
  fun migrationTargetsTheCurrentSchemaVersion() {
    assertEquals(36, TELEMETRY_DATABASE_VERSION)
    assertEquals(34, TelemetryDatabase.MIGRATION_34_35.startVersion)
    assertEquals(35, TelemetryDatabase.MIGRATION_34_35.endVersion)
  }

  // MARK: Backfill

  /**
   * The point of shipping this as a migration rather than a column add: a row left without a
   * `board_id` is telemetry with no owner, unjoinable and unbackupable.
   */
  @Test
  fun bothTablesBackfillBoardIdByMatchingTheBleIdentifier() {
    for (match in listOf("INSERT INTO telemetry_frames_new", "INSERT INTO telemetry_minute_buckets_new")) {
      val sql = statement(match)
      assertTrue(
        "$match does not resolve device_id through boards.ble_id",
        sql.contains("SELECT b.id FROM boards b WHERE b.ble_id ="),
      )
    }
  }

  /** A row that never carried an identifier stays unattributed rather than joining a random Board. */
  @Test
  fun framesWithNoIdentifierBackfillToNullAndBucketsToTheUnknownSentinel() {
    assertTrue(
      "frames without a device_id do not backfill to NULL",
      statement("INSERT INTO telemetry_frames_new").contains("device_id = '' THEN NULL"),
    )
    assertTrue(
      "buckets without a device_id do not backfill to the unknown sentinel",
      statement("INSERT INTO telemetry_minute_buckets_new").contains("device_id = '' THEN ''"),
    )
  }

  // MARK: Orphan minting

  /**
   * Telemetry from a Board hard-deleted before tombstones existed, or from a peripheral the Board
   * was re-linked away from, resolves to nothing. Without a minted Board it loses both its identity
   * and its label — the one case in this migration sequence that creates rows the Rider never made.
   */
  @Test
  fun unresolvedIdentifiersMintATombstonedBoardNamedFromTheHistoricalDeviceName() {
    for (table in listOf("telemetry_frames", "telemetry_minute_buckets")) {
      val sql = migrationSql().firstOrNull {
        it.startsWith("INSERT OR IGNORE INTO boards") && it.contains("FROM $table t")
      } ?: throw AssertionError("no orphan mint sourced from $table")

      assertTrue(
        "the mint does not skip identifiers a Board still claims",
        sql.contains("NOT EXISTS (SELECT 1 FROM boards b WHERE b.ble_id = t.device_id)"),
      )
      assertTrue(
        "the minted Board is not named from the telemetry's own device_name",
        sql.contains("SELECT n.device_name FROM $table n"),
      )
      assertTrue(
        "the minted Board id is not derived from the identifier, so re-running duplicates it",
        sql.contains("'$ORPHAN_BOARD_ID_PREFIX' || t.device_id"),
      )
    }
  }

  /**
   * A minted Board must never reach the Rider's Board list, and must never capture a future
   * re-link: the tombstone stamp keeps it out of `getBoards()`, the null `ble_id` keeps it out of
   * every identifier match — including this migration's own backfill on a later upgrade.
   */
  @Test
  fun aMintedBoardIsTombstonedAndCarriesNoBoardLink() {
    val sql = statement("FROM telemetry_frames t")
    val columns = sql.substringAfter("(").substringBefore(")").split(",").map { it.trim() }
    // Tail of the SELECT list, in column order: ble_id, created_at, updated_at, sync_seq,
    // deleted_at. A literal NULL for the link, a stamped epoch for the tombstone.
    val selected = sql.substringBefore("FROM telemetry_frames t").lines()
      .map { it.trim().trimEnd(',') }
      .filter { it.isNotEmpty() }
      .takeLast(5)

    assertEquals(
      listOf("id", "name", "ble_id", "created_at", "updated_at", "sync_seq", "deleted_at"),
      columns,
    )
    assertEquals("a minted Board carries a Board Link", "NULL", selected.first())
    assertTrue("a minted Board is not tombstoned", selected.last().toLongOrNull() != null)
    assertTrue(
      "the Rider's Board list would show minted Boards",
      daoSource().contains("SELECT * FROM boards WHERE deleted_at IS NULL ORDER BY created_at ASC"),
    )
  }

  /** A minted Board is an ordinary write and has to upload like one. */
  @Test
  fun mintedBoardsGetASyncCursorPositionAboveEveryExistingRow() {
    val sql = migrationSql()
    val numbered = sql.indexOfFirst { it.contains("UPDATE boards") && it.contains("SET sync_seq =") }
    val reseeded = sql.indexOfFirst {
      it.contains("INSERT OR REPLACE INTO sync_sequences") && it.contains("'boards'")
    }

    assertTrue("minted Boards keep sync_seq 0 and never upload", numbered >= 0)
    assertTrue("the boards counter is reseeded before the new rows are numbered", reseeded > numbered)
  }

  // MARK: Table rebuild

  /**
   * The primary key move is a rebuild, not an `ALTER`. `updated_at` and `sync_seq` landed on this
   * table earlier in the same release, so the copy has to name them explicitly — a bucket that
   * silently resets its cursor position stops uploading.
   */
  @Test
  fun theBucketRebuildMovesThePrimaryKeyAndCarriesTheSyncColumns() {
    val create = statement("CREATE TABLE telemetry_minute_buckets_new")
    val copy = statement("INSERT INTO telemetry_minute_buckets_new")

    assertTrue(
      "the bucket primary key is not (bucket_start_ms, board_id)",
      create.contains("PRIMARY KEY (bucket_start_ms, board_id)"),
    )
    for (column in listOf("updated_at", "sync_seq")) {
      assertTrue("the rebuilt bucket table drops $column", create.contains(column))
      assertTrue("the bucket rebuild does not carry $column across", copy.contains(column))
    }
    assertTrue(
      "the rebuilt table is not swapped in",
      migrationSql().contains("ALTER TABLE telemetry_minute_buckets_new RENAME TO telemetry_minute_buckets"),
    )
  }

  /**
   * The copy is grouped so the rebuild is total: an ungrouped copy would abort the whole migration
   * on a `board_id` collision, stranding the database mid-upgrade.
   */
  @Test
  fun theBucketCopyIsGroupedSoAKeyCollisionCannotAbortTheRebuild() {
    val copy = statement("INSERT INTO telemetry_minute_buckets_new")

    assertTrue("colliding buckets are not folded", copy.contains("GROUP BY b.bucket_start_ms, board_id"))
    assertTrue("sample counts are not summed on a fold", copy.contains("SUM(b.sample_count)"))
    assertTrue("peak speed is not kept on a fold", copy.contains("MAX(b.max_abs_speed_centi_kmh)"))
  }

  /** Neither table may keep the columns ADR 0028 retires, on either the schema or the copy. */
  @Test
  fun bothRebuiltTablesDropTheBleIdentifierAndTheDenormalizedName() {
    for (table in listOf("telemetry_frames", "telemetry_minute_buckets")) {
      val create = statement("CREATE TABLE ${table}_new")
      assertFalse("$table keeps device_id", create.contains("device_id"))
      assertFalse("$table keeps device_name", create.contains("device_name"))
      assertTrue("$table has no board_id", create.contains("board_id"))
      assertTrue(
        "the rebuilt $table is not swapped in",
        migrationSql().contains("ALTER TABLE ${table}_new RENAME TO $table"),
      )
    }
  }

  /** The frame index that meant "this Board" while saying `device_id` follows the column. */
  @Test
  fun theFrameLookupIndexMovesOntoBoardId() {
    val sql = migrationSql()

    assertTrue(
      "the old device_id index survives the rebuild",
      sql.contains("DROP INDEX IF EXISTS index_telemetry_frames_device_id_captured_at_ms"),
    )
    assertTrue(
      "frames have no board_id lookup index",
      sql.any { it.contains("index_telemetry_frames_board_id_captured_at_ms") },
    )
  }

  // MARK: Untouched tables

  /**
   * Markers, diagnostic events and Metric Exclusion Ranges keep both columns: that is what crosses
   * the wire for them, and they are low-cardinality display rows rather than a per-sample cost.
   */
  @Test
  fun markersDiagnosticEventsAndExclusionRangesAreNotTouched() {
    val sql = migrationSql().joinToString("\n")

    for (table in listOf("telemetry_markers", "diagnostic_events", "metric_exclusion_ranges")) {
      assertFalse("the migration rewrites $table", sql.contains(table))
    }
  }
}
