package expo.modules.vescapecore.telemetry

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.lang.reflect.Proxy

/**
 * Incremental-sync cursors: schema 29→30 adds `updated_at` to `boards`, `alerts` and
 * `telemetry_minute_buckets`, backfills it from each table's best evidence of last change, and
 * indexes it. Schema 30→31 then splits the two jobs that column was doing — `sync_seq` carries the
 * Sync Cursor, `updated_at` stays the last-write-wins timestamp. Every write path has to move both.
 *
 * @parity /modules/vescape-core/ios/telemetry/SyncCursorMigrationTests.swift
 */
class SyncCursorMigrationTest {
  /** Table → the column its pre-30 rows backfill from. */
  private val backfillSource = mapOf(
    "boards" to "created_at",
    "alerts" to "created_at",
    "telemetry_minute_buckets" to "last_sample_at_ms",
  )

  private fun migrationSql(migration: Migration): List<String> {
    val sql = mutableListOf<String>()
    val db = Proxy.newProxyInstance(
      SupportSQLiteDatabase::class.java.classLoader,
      arrayOf(SupportSQLiteDatabase::class.java),
    ) { _, method, args ->
      if (method.name == "execSQL") {
        sql += args?.firstOrNull() as String
        null
      } else {
        throw UnsupportedOperationException(method.name)
      }
    } as SupportSQLiteDatabase
    migration.migrate(db)
    return sql
  }

  private fun migrationSql(): List<String> = migrationSql(TelemetryDatabase.MIGRATION_29_30)

  private fun daoSource(): String =
    File("src/main/java/expo/modules/vescapecore/telemetry/TelemetryDao.kt").readText()

  @Test
  fun migrationAddsUpdatedAtColumnAndIndexToEverySyncedTable() {
    val sql = migrationSql()

    for (table in backfillSource.keys) {
      assertTrue(
        "missing updated_at column on $table",
        sql.any { it == "ALTER TABLE $table ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0" },
      )
      assertTrue(
        "missing updated_at index on $table",
        sql.any {
          it == "CREATE INDEX IF NOT EXISTS index_${table}_updated_at ON $table(updated_at)"
        },
      )
    }
  }

  /**
   * The backfill is the whole point of shipping this as a migration rather than a plain column add:
   * a row left at the `DEFAULT 0` would report epoch zero to the server and get re-synced forever.
   */
  @Test
  fun migrationBackfillsExistingRowsInsteadOfLeavingThemAtZero() {
    val sql = migrationSql()

    for ((table, source) in backfillSource) {
      val added = sql.indexOf("ALTER TABLE $table ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0")
      val backfilled = sql.indexOf("UPDATE $table SET updated_at = $source")
      assertTrue("missing backfill for $table", backfilled >= 0)
      // The backfill only works once the column exists.
      assertTrue("backfill for $table runs before the column is added", backfilled > added)
    }
  }

  @Test
  fun migrationsTargetTheCurrentSchemaVersion() {
    assertEquals(31, TELEMETRY_DATABASE_VERSION)
    assertEquals(29, TelemetryDatabase.MIGRATION_29_30.startVersion)
    assertEquals(30, TelemetryDatabase.MIGRATION_29_30.endVersion)
    assertEquals(30, TelemetryDatabase.MIGRATION_30_31.startVersion)
    assertEquals(31, TelemetryDatabase.MIGRATION_30_31.endVersion)
  }

  /**
   * The regression this whole change exists to prevent. `setAlertRuleEnabled` is a targeted UPDATE
   * rather than an entity round-trip, so it is the one write path that can silently skip both sync
   * columns — toggling an alert would then never reach the server.
   *
   * Asserted against the DAO source because Room's `@Query` has BINARY retention (invisible to
   * runtime reflection) and its generated implementation keeps the SQL in a method-local string.
   * A JVM unit test has no other handle on the statement Room will actually run.
   */
  @Test
  fun setAlertRuleEnabledQueryMovesBothSyncColumns() {
    // The statement is written as a concatenation to stay inside the line limit; join it back up
    // before matching so the test sees the string Room will compile.
    val dao = daoSource().replace(Regex("""\"\s*\+\s*\""""), "")
    val query = Regex("""\"(UPDATE alerts SET[^"]*)\"""").find(dao)?.groupValues?.get(1)

    assertEquals(
      "UPDATE alerts SET enabled = :enabled, updated_at = MAX(updated_at + 1, :updatedAt), " +
        "sync_seq = :syncSeq WHERE board_id = :boardId AND id = :id",
      query,
    )
  }

  // MARK: Sync Cursor sequence (#275)

  /**
   * The Sync Cursor scan runs on `sync_seq`, not on `updated_at`. A wall clock that steps backwards
   * lands a write below a cursor the phone has already passed, and the scan never picks it up; a
   * counter cannot regress.
   */
  @Test
  fun syncSeqMigrationAddsColumnIndexAndCounterToEverySyncedTable() {
    val sql = migrationSql(TelemetryDatabase.MIGRATION_30_31)

    assertTrue(
      "missing sync_sequences table",
      sql.any { it.contains("CREATE TABLE IF NOT EXISTS sync_sequences") },
    )
    for (table in SYNC_SEQ_TABLES) {
      assertTrue(
        "missing sync_seq column on $table",
        sql.any { it == "ALTER TABLE $table ADD COLUMN sync_seq INTEGER NOT NULL DEFAULT 0" },
      )
      assertTrue(
        "missing sync_seq index on $table",
        sql.any { it == "CREATE INDEX IF NOT EXISTS index_${table}_sync_seq ON $table(sync_seq)" },
      )
      assertTrue(
        "missing counter seed for $table",
        sql.any { it.contains("INSERT OR REPLACE INTO sync_sequences") && it.contains("'$table'") },
      )
    }
  }

  /**
   * Existing rows need distinct, increasing positions and the counter has to resume above all of
   * them, or the first writes after upgrade reuse numbers the scan would order wrongly.
   */
  @Test
  fun syncSeqMigrationBackfillsExistingRowsBeforeSeedingTheCounter() {
    val sql = migrationSql(TelemetryDatabase.MIGRATION_30_31)

    for (table in SYNC_SEQ_TABLES) {
      val backfilled = sql.indexOf("UPDATE $table SET sync_seq = rowid")
      val seeded = sql.indexOfFirst {
        it.contains("INSERT OR REPLACE INTO sync_sequences") && it.contains("'$table'")
      }
      assertTrue("missing sync_seq backfill for $table", backfilled >= 0)
      assertTrue("counter for $table is seeded before its rows are numbered", seeded > backfilled)
    }
  }

  /** Every entity write path stamps a fresh position, including the merge branch for buckets. */
  @Test
  fun everyEntityWritePathAllocatesASyncSeq() {
    val dao = daoSource()

    for (marker in listOf(
      "syncSeq = nextSyncSeq(SYNC_SEQ_BOARDS)",
      "syncSeq = nextSyncSeq(SYNC_SEQ_ALERTS)",
      "syncSeq = nextSyncSeq(SYNC_SEQ_MINUTE_BUCKETS)",
    )) {
      assertTrue("no write path allocates via `$marker`", dao.contains(marker))
    }
    // The bucket merge folds into the stored row, so the fresh position has to survive the fold.
    assertTrue("bucket merge drops the new sync_seq", dao.contains("syncSeq = next.syncSeq"))
  }

  // MARK: Last-write-wins ratchet (#275)

  /**
   * The server keeps its stored row unless the incoming stamp is strictly newer, so a rewound clock
   * that stamps at or below it is a silently dropped edit — freezing the value is not enough.
   */
  @Test
  fun ratchetStepsPastAStampTheClockCannotBeat() {
    assertEquals(1_000L, ratchetUpdatedAt(null, 1_000L))
    // Clock ahead of the stored row: truthful wall clock, no inflation.
    assertEquals(5_000L, ratchetUpdatedAt(1_000L, 5_000L))
    // Clock rewound below it, or stalled on it: strictly above.
    assertEquals(5_001L, ratchetUpdatedAt(5_000L, 1_000L))
    assertEquals(5_001L, ratchetUpdatedAt(5_000L, 5_000L))
  }

  @Test
  fun boardAndAlertUpsertsRatchetAgainstTheStoredStamp() {
    val dao = daoSource()

    assertTrue(
      "board upsert does not ratchet",
      dao.contains("ratchetUpdatedAt(getBoardUpdatedAt(board.id), board.updatedAt)"),
    )
    assertTrue(
      "alert upsert does not ratchet",
      dao.contains("ratchetUpdatedAt(getAlertRuleUpdatedAt(rule.boardId, rule.id), rule.updatedAt)"),
    )
  }

  @Test
  fun boardAndAlertRuleBridgeShapesCarryTheCursor() {
    val board = mapOf(
      "id" to "board-1",
      "name" to "ADV",
      "createdAt" to 1_000L,
      // Native ignores a bridge-supplied cursor and stamps its own.
      "updatedAt" to 1L,
    ).toBoardEntity(now = 2_000L)

    assertEquals(1_000L, board.createdAt)
    assertEquals(2_000L, board.updatedAt)
    assertEquals(2_000L, board.toMap(emptyList())["updatedAt"])

    val rule = mapOf(
      "boardId" to "board-1",
      "id" to "rule-1",
      "controlId" to "duty",
      "threshold" to 70.0,
      "enabled" to true,
      "createdAt" to 1_000L,
      "updatedAt" to 1L,
    ).toAlertRuleEntity(now = 2_000L)

    assertEquals(1_000L, rule.createdAt)
    assertEquals(2_000L, rule.updatedAt)
    assertEquals(2_000L, rule.toMap()["updatedAt"])
  }
}
