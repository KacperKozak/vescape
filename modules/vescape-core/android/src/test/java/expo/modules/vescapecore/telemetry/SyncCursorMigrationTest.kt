package expo.modules.vescapecore.telemetry

import androidx.sqlite.db.SupportSQLiteDatabase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.lang.reflect.Proxy

/**
 * Incremental-sync cursors: schema 27→28 adds `updated_at` to `boards`, `alerts` and
 * `telemetry_minute_buckets`, backfills it from each table's best evidence of last change, and
 * indexes it. Every write path then has to move it.
 *
 * @parity /modules/vescape-core/ios/telemetry/SyncCursorMigrationTests.swift
 */
class SyncCursorMigrationTest {
  /** Table → the column its pre-28 rows backfill from. */
  private val backfillSource = mapOf(
    "boards" to "created_at",
    "alerts" to "created_at",
    "telemetry_minute_buckets" to "last_sample_at_ms",
  )

  private fun migrationSql(): List<String> {
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
    TelemetryDatabase.MIGRATION_27_28.migrate(db)
    return sql
  }

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
  fun migrationTargetsTheCurrentSchemaVersion() {
    assertEquals(28, TELEMETRY_DATABASE_VERSION)
    assertEquals(27, TelemetryDatabase.MIGRATION_27_28.startVersion)
    assertEquals(28, TelemetryDatabase.MIGRATION_27_28.endVersion)
  }

  /**
   * The regression this whole change exists to prevent. `setAlertRuleEnabled` is a targeted UPDATE
   * rather than an entity round-trip, so it is the one write path that can silently skip the cursor
   * — toggling an alert would then never reach the server.
   *
   * Asserted against the DAO source because Room's `@Query` has BINARY retention (invisible to
   * runtime reflection) and its generated implementation keeps the SQL in a method-local string.
   * A JVM unit test has no other handle on the statement Room will actually run.
   */
  @Test
  fun setAlertRuleEnabledQueryBumpsUpdatedAt() {
    val dao = File("src/main/java/expo/modules/vescapecore/telemetry/TelemetryDao.kt").readText()
    val query = Regex("""@Query\("(UPDATE alerts SET[^"]*)"\)""").find(dao)?.groupValues?.get(1)

    assertEquals(
      "UPDATE alerts SET enabled = :enabled, updated_at = :updatedAt " +
        "WHERE board_id = :boardId AND id = :id",
      query,
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
