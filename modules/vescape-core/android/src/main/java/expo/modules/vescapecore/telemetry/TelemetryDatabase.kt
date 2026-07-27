package expo.modules.vescapecore.telemetry

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import java.io.File

// @parity /modules/vescape-core/ios/VescapeCoreModule.swift
internal const val TELEMETRY_DATABASE_NAME = "vescape.db"
internal const val LEGACY_TELEMETRY_DATABASE_NAME = "telemetry.db"
internal const val TELEMETRY_DATABASE_VERSION = 29

@Database(
  entities = [
    TelemetryFrameEntity::class,
    TelemetryMinuteBucketEntity::class,
    TelemetryMarkerEntity::class,
    MetricExclusionRangeEntity::class,
    BoardEntity::class,
    BoardSettingEntity::class,
    AlertRuleEntity::class,
    AppSettingEntity::class,
    TuneProfileEntity::class,
    TuneHistoryEntryEntity::class,
    DiagnosticEventEntity::class,
    PrivacyZoneEntity::class,
    MapPointEntity::class,
    BoardWarningEntity::class,
    SyncSequenceEntity::class,
  ],
  version = TELEMETRY_DATABASE_VERSION,
  exportSchema = false,
)
abstract class TelemetryDatabase : RoomDatabase() {
  abstract fun telemetryDao(): TelemetryDao

  companion object {
    @Volatile
    private var instance: TelemetryDatabase? = null

    private fun hasColumn(db: SupportSQLiteDatabase, tableName: String, columnName: String): Boolean {
      db.query("PRAGMA table_info($tableName)").use { cursor ->
        val nameIndex = cursor.getColumnIndex("name")
        while (cursor.moveToNext()) {
          if (cursor.getString(nameIndex) == columnName) return true
        }
      }
      return false
    }

    private val MIGRATION_3_4 = object : Migration(3, 4) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
          """
          CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER NOT NULL DEFAULT 1 PRIMARY KEY,
            live_history_limit INTEGER NOT NULL DEFAULT 5,
            auto_connect INTEGER NOT NULL DEFAULT 1,
            auto_recording INTEGER NOT NULL DEFAULT 0
          )
          """.trimIndent(),
        )
      }
    }

    private val MIGRATION_4_5 = object : Migration(4, 5) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE app_settings ADD COLUMN selected_board_id TEXT")
      }
    }

    private val MIGRATION_5_6 = object : Migration(5, 6) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
          """
          ALTER TABLE telemetry_minute_buckets
          ADD COLUMN battery_used_wh_milli INTEGER NOT NULL DEFAULT 0
          """.trimIndent(),
        )
        db.execSQL(
          """
          ALTER TABLE telemetry_minute_buckets
          ADD COLUMN battery_regen_wh_milli INTEGER NOT NULL DEFAULT 0
          """.trimIndent(),
        )
      }
    }

    private val MIGRATION_6_7 = object : Migration(6, 7) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE app_settings ADD COLUMN last_gps_latitude REAL")
        db.execSQL("ALTER TABLE app_settings ADD COLUMN last_gps_longitude REAL")
      }
    }

    private val MIGRATION_7_8 = object : Migration(7, 8) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
          """
          CREATE TABLE IF NOT EXISTS tune_profiles (
            id TEXT NOT NULL PRIMARY KEY,
            board_id TEXT NOT NULL,
            name TEXT NOT NULL,
            icon TEXT NOT NULL DEFAULT 'sliders-horizontal',
            color TEXT NOT NULL DEFAULT 'purple',
            fields_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
          """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_tune_profiles_board_id ON tune_profiles(board_id)")
        db.execSQL(
          """
          CREATE TABLE IF NOT EXISTS tune_history_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            profile_id TEXT NOT NULL,
            fields_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )
          """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_tune_history_entries_profile_id ON tune_history_entries(profile_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_tune_history_entries_created_at ON tune_history_entries(created_at)")
      }
    }

    private val MIGRATION_8_9 = object : Migration(8, 9) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("DROP TABLE IF EXISTS history_locations")
        db.execSQL("DELETE FROM telemetry_minute_buckets WHERE sample_count = 0")
      }
    }

    private val MIGRATION_9_10 = object : Migration(9, 10) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE telemetry_minute_buckets ADD COLUMN moving_speed_sample_count INTEGER")
        db.execSQL("ALTER TABLE telemetry_minute_buckets ADD COLUMN sum_moving_abs_speed_centi_kmh INTEGER")
      }
    }

    private val MIGRATION_10_11 = object : Migration(10, 11) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE app_settings ADD COLUMN moving_avg_speed_threshold_kmh REAL NOT NULL DEFAULT 3.0")
      }
    }

    private val MIGRATION_11_12 = object : Migration(11, 12) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("DROP TABLE IF EXISTS app_settings")
        db.execSQL(
          """
          CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT NOT NULL PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
          """.trimIndent(),
        )
      }
    }

    private val MIGRATION_12_13 = object : Migration(12, 13) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
          """
          CREATE TABLE IF NOT EXISTS diagnostic_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            occurred_at_ms INTEGER NOT NULL,
            elapsed_realtime_ms INTEGER NOT NULL,
            event_name TEXT NOT NULL,
            operation TEXT,
            phase TEXT,
            device_id TEXT,
            device_name TEXT,
            message TEXT,
            properties_json TEXT NOT NULL
          )
          """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_diagnostic_events_occurred_at_ms ON diagnostic_events(occurred_at_ms)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_diagnostic_events_event_name ON diagnostic_events(event_name)")
        db.execSQL(
          """
          CREATE INDEX IF NOT EXISTS index_diagnostic_events_device_id_occurred_at_ms
          ON diagnostic_events(device_id, occurred_at_ms)
          """.trimIndent(),
        )
      }
    }

    private val MIGRATION_13_14 = object : Migration(13, 14) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE telemetry_minute_buckets ADD COLUMN max_temp_mosfet_deci_c INTEGER")
        db.execSQL("ALTER TABLE telemetry_minute_buckets ADD COLUMN max_temp_motor_deci_c INTEGER")
        db.execSQL("ALTER TABLE telemetry_minute_buckets ADD COLUMN first_latitude_e7 INTEGER")
        db.execSQL("ALTER TABLE telemetry_minute_buckets ADD COLUMN first_longitude_e7 INTEGER")
      }
    }

    private val MIGRATION_14_15 = object : Migration(14, 15) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
          """
          CREATE TABLE IF NOT EXISTS metric_exclusions (
            captured_at_ms INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            metric TEXT NOT NULL,
            reason TEXT NOT NULL,
            PRIMARY KEY(captured_at_ms, device_id, metric)
          )
          """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_metric_exclusions_captured_at_ms ON metric_exclusions(captured_at_ms)")
        db.execSQL(
          """
          CREATE INDEX IF NOT EXISTS index_metric_exclusions_device_id_captured_at_ms
          ON metric_exclusions(device_id, captured_at_ms)
          """.trimIndent(),
        )
      }
    }

    private val MIGRATION_15_16 = object : Migration(15, 16) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE metric_exclusions ADD COLUMN raw_value TEXT")
        db.execSQL("ALTER TABLE metric_exclusions ADD COLUMN reference_value TEXT")
        db.execSQL("ALTER TABLE metric_exclusions ADD COLUMN context_json TEXT")
      }
    }

    private val MIGRATION_16_17 = object : Migration(16, 17) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("DROP TABLE IF EXISTS metric_exclusions")
        db.execSQL(
          """
          CREATE TABLE IF NOT EXISTS metric_exclusion_ranges (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            device_id TEXT NOT NULL,
            reason TEXT NOT NULL,
            start_ms INTEGER NOT NULL,
            end_ms INTEGER NOT NULL,
            sample_count INTEGER NOT NULL
          )
          """.trimIndent(),
        )
        db.execSQL(
          """
          CREATE INDEX IF NOT EXISTS index_metric_exclusion_ranges_start_ms_end_ms
          ON metric_exclusion_ranges(start_ms, end_ms)
          """.trimIndent(),
        )
        db.execSQL(
          """
          CREATE INDEX IF NOT EXISTS index_metric_exclusion_ranges_device_id_start_ms_end_ms
          ON metric_exclusion_ranges(device_id, start_ms, end_ms)
          """.trimIndent(),
        )
      }
    }

    private val MIGRATION_17_18 = object : Migration(17, 18) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
          """
          CREATE TABLE IF NOT EXISTS privacy_zones (
            id TEXT NOT NULL PRIMARY KEY,
            preset TEXT NOT NULL,
            name TEXT NOT NULL,
            enabled INTEGER NOT NULL,
            center_latitude_e7 INTEGER NOT NULL,
            center_longitude_e7 INTEGER NOT NULL,
            radius_meters INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
          """.trimIndent(),
        )
      }
    }

    internal val MIGRATION_18_19 = object : Migration(18, 19) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("DROP INDEX IF EXISTS index_boards_created_at")
        db.execSQL("DROP INDEX IF EXISTS index_boards_is_starred")
        db.execSQL(
          """
          CREATE TABLE IF NOT EXISTS boards_new (
            id TEXT NOT NULL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            ble_id TEXT,
            is_starred INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            battery_config_json TEXT
          )
          """.trimIndent(),
        )
        db.execSQL(
          """
          INSERT INTO boards_new (id, name, description, ble_id, is_starred, created_at, battery_config_json)
          SELECT id, name, description, ble_id, is_starred, created_at, NULL
          FROM boards
          """.trimIndent(),
        )
        db.execSQL("DROP TABLE boards")
        db.execSQL("ALTER TABLE boards_new RENAME TO boards")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_boards_created_at ON boards(created_at)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_boards_is_starred ON boards(is_starred)")
      }
    }

    internal val MIGRATION_19_20 = object : Migration(19, 20) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
          """
          CREATE TABLE IF NOT EXISTS map_points (
            id TEXT NOT NULL PRIMARY KEY,
            kind TEXT NOT NULL,
            latitude_e7 INTEGER NOT NULL,
            longitude_e7 INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
          """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_map_points_kind ON map_points(kind)")
      }
    }

    internal val MIGRATION_20_21 = object : Migration(20, 21) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
          """
          CREATE TABLE IF NOT EXISTS board_settings (
            board_id TEXT NOT NULL,
            key TEXT NOT NULL,
            value_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (board_id, key)
          )
          """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_board_settings_board_id ON board_settings(board_id)")
        db.execSQL(
          """
          INSERT OR REPLACE INTO board_settings (board_id, key, value_json, updated_at)
          SELECT id, 'description', json_quote(description), created_at
          FROM boards
          WHERE description IS NOT NULL
          """.trimIndent(),
        )
        db.execSQL(
          """
          INSERT OR REPLACE INTO board_settings (board_id, key, value_json, updated_at)
          SELECT id, 'batteryConfig', battery_config_json, created_at
          FROM boards
          WHERE battery_config_json IS NOT NULL
          """.trimIndent(),
        )
        db.execSQL("DROP INDEX IF EXISTS index_boards_is_starred")
        db.execSQL("DROP INDEX IF EXISTS index_boards_created_at")
        db.execSQL(
          """
          CREATE TABLE IF NOT EXISTS boards_new (
            id TEXT NOT NULL PRIMARY KEY,
            name TEXT NOT NULL,
            ble_id TEXT,
            created_at INTEGER NOT NULL
          )
          """.trimIndent(),
        )
        db.execSQL(
          """
          INSERT INTO boards_new (id, name, ble_id, created_at)
          SELECT id, name, ble_id, created_at
          FROM boards
          """.trimIndent(),
        )
        db.execSQL("DROP TABLE boards")
        db.execSQL("ALTER TABLE boards_new RENAME TO boards")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_boards_created_at ON boards(created_at)")
      }
    }

    internal val MIGRATION_21_22 = object : Migration(21, 22) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE telemetry_minute_buckets ADD COLUMN first_moving_at_ms INTEGER")
        db.execSQL("ALTER TABLE telemetry_minute_buckets ADD COLUMN last_moving_at_ms INTEGER")
      }
    }

    internal val MIGRATION_22_23 = object : Migration(22, 23) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE tune_profiles ADD COLUMN icon TEXT NOT NULL DEFAULT 'sliders-horizontal'")
        db.execSQL("ALTER TABLE tune_profiles ADD COLUMN color TEXT NOT NULL DEFAULT 'purple'")
      }
    }

    internal val MIGRATION_23_24 = object : Migration(23, 24) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE tune_profiles ADD COLUMN refloat_base_version TEXT NOT NULL DEFAULT ''")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_tune_profiles_board_id_refloat_base_version ON tune_profiles(board_id, refloat_base_version)")
      }
    }

    internal val MIGRATION_24_25 = object : Migration(24, 25) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
          """
          CREATE TABLE IF NOT EXISTS board_warnings (
            board_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            severity TEXT NOT NULL,
            first_detected_at INTEGER NOT NULL,
            last_detected_at INTEGER NOT NULL,
            payload_json TEXT NOT NULL,
            PRIMARY KEY (board_id, kind)
          )
          """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_board_warnings_board_id ON board_warnings(board_id)")
      }
    }

    internal val MIGRATION_25_26 = object : Migration(25, 26) {
      override fun migrate(db: SupportSQLiteDatabase) {
        if (!hasColumn(db, "alerts", "source")) {
          db.execSQL("ALTER TABLE alerts ADD COLUMN source TEXT")
        }
      }
    }

    /**
     * Per-board Alert Rules (#254). Alert Rules become owned by one Board (`board_id NOT NULL`,
     * composite PK so preset ids repeat per board). Pre-release decision: existing global rules are
     * dropped, not reassigned — riders redo alert setup per board. The three former global settings
     * keys (Alert Preset selection, Rider Top Speed, onboarding flag) move to Board Settings, so
     * their app_settings rows are dropped.
     *
     * @parity /modules/vescape-core/ios/telemetry/TelemetryDatabase.swift `v27_alert_board_id`
     */
    internal val MIGRATION_26_27 = object : Migration(26, 27) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("DROP TABLE IF EXISTS alerts")
        db.execSQL(
          """
          CREATE TABLE alerts (
            board_id TEXT NOT NULL,
            id TEXT NOT NULL,
            control_id TEXT NOT NULL,
            threshold REAL NOT NULL,
            threshold_max REAL,
            enabled INTEGER NOT NULL,
            sound_type TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            source TEXT,
            PRIMARY KEY (board_id, id)
          )
          """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_alerts_board_id ON alerts(board_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_alerts_control_id ON alerts(control_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_alerts_enabled ON alerts(enabled)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_alerts_created_at ON alerts(created_at)")
        db.execSQL(
          "DELETE FROM app_settings WHERE key IN ('alertPreset', 'riderTopSpeedKmh', 'alertPresetsOnboarded')",
        )
      }
    }

    /**
     * Incremental-sync cursor on `boards`, `alerts` and `telemetry_minute_buckets`. The first two
     * carried `created_at` only, so a board rename or an alert toggle was invisible to an
     * "everything changed since T" query — the shape every other mutable table already supports.
     * Buckets are append-and-merge targets with no cursor at all.
     *
     * Existing rows backfill to the best evidence of when they last changed — `created_at` for
     * boards and alerts, `last_sample_at_ms` for buckets — never 0 and never null, so a first sync
     * after upgrade reports each row at its true age instead of flooding the server with
     * epoch-zero rows.
     *
     * @parity /modules/vescape-core/ios/telemetry/TelemetryDatabase.swift `v28_sync_cursors`
     */
    internal val MIGRATION_27_28 = object : Migration(27, 28) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE boards ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0")
        db.execSQL("UPDATE boards SET updated_at = created_at")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_boards_updated_at ON boards(updated_at)")

        db.execSQL("ALTER TABLE alerts ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0")
        db.execSQL("UPDATE alerts SET updated_at = created_at")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_alerts_updated_at ON alerts(updated_at)")

        db.execSQL("ALTER TABLE telemetry_minute_buckets ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0")
        db.execSQL("UPDATE telemetry_minute_buckets SET updated_at = last_sample_at_ms")
        db.execSQL(
          "CREATE INDEX IF NOT EXISTS index_telemetry_minute_buckets_updated_at " +
            "ON telemetry_minute_buckets(updated_at)",
        )
      }
    }

    /**
     * Splits the Sync Cursor off the last-write-wins timestamp (#275). `sync_seq` is a device-local
     * counter the upload scan runs on; `updated_at` keeps its wall-clock meaning and stays the value
     * the server compares. Scanning a counter is what makes the scan complete under a device clock
     * that steps backwards, which an `updated_at >= watermark` scan is not.
     *
     * Existing rows backfill from `rowid`: nothing has ever been uploaded, so any strictly
     * increasing assignment works, and `rowid` gives one for free without an O(n²) self-join over
     * tables that hold a row per ridden minute. Each counter then starts above every assigned value.
     *
     * @parity /modules/vescape-core/ios/telemetry/TelemetryDatabase.swift `v29_sync_seq`
     */
    internal val MIGRATION_28_29 = object : Migration(28, 29) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
          """
          CREATE TABLE IF NOT EXISTS sync_sequences (
            name TEXT NOT NULL PRIMARY KEY,
            last_value INTEGER NOT NULL
          )
          """.trimIndent(),
        )
        for (table in SYNC_SEQ_TABLES) {
          db.execSQL("ALTER TABLE $table ADD COLUMN sync_seq INTEGER NOT NULL DEFAULT 0")
          db.execSQL("UPDATE $table SET sync_seq = rowid")
          db.execSQL("CREATE INDEX IF NOT EXISTS index_${table}_sync_seq ON $table(sync_seq)")
          db.execSQL(
            "INSERT OR REPLACE INTO sync_sequences (name, last_value) " +
              "VALUES ('$table', (SELECT COALESCE(MAX(sync_seq), 0) FROM $table))",
          )
        }
      }
    }

    /**
     * One-time file rename from the pre-release "telemetry.db" name. Checkpoints the legacy WAL so
     * the whole database lives in the main file, then renames it in place. Idempotent: once the new
     * file exists (or no legacy file is present) this is a no-op.
     */
    private fun migrateLegacyDatabaseFile(context: Context) {
      val target = context.getDatabasePath(TELEMETRY_DATABASE_NAME)
      val legacy = context.getDatabasePath(LEGACY_TELEMETRY_DATABASE_NAME)
      if (target.exists() || !legacy.exists()) return
      runCatching {
        SQLiteDatabase.openDatabase(legacy.path, null, SQLiteDatabase.OPEN_READWRITE).use { db ->
          db.rawQuery("PRAGMA wal_checkpoint(TRUNCATE)", null).close()
        }
      }
      target.parentFile?.mkdirs()
      if (legacy.renameTo(target)) {
        File("${legacy.path}-wal").delete()
        File("${legacy.path}-shm").delete()
      }
    }

    fun get(context: Context): TelemetryDatabase {
      return instance ?: synchronized(this) {
        migrateLegacyDatabaseFile(context.applicationContext)
        instance ?: Room.databaseBuilder(
          context.applicationContext,
          TelemetryDatabase::class.java,
          TELEMETRY_DATABASE_NAME,
        )
          .addMigrations(
            MIGRATION_3_4,
            MIGRATION_4_5,
            MIGRATION_5_6,
            MIGRATION_6_7,
            MIGRATION_7_8,
            MIGRATION_8_9,
            MIGRATION_9_10,
            MIGRATION_10_11,
            MIGRATION_11_12,
            MIGRATION_12_13,
            MIGRATION_13_14,
            MIGRATION_14_15,
            MIGRATION_15_16,
            MIGRATION_16_17,
            MIGRATION_17_18,
            MIGRATION_18_19,
            MIGRATION_19_20,
            MIGRATION_20_21,
            MIGRATION_21_22,
            MIGRATION_22_23,
            MIGRATION_23_24,
            MIGRATION_24_25,
            MIGRATION_25_26,
            MIGRATION_26_27,
            MIGRATION_27_28,
            MIGRATION_28_29,
          )
          .fallbackToDestructiveMigration(true)
          .addCallback(object : Callback() {
            override fun onCreate(db: SupportSQLiteDatabase) {
              db.execSQL(
                """
                CREATE INDEX IF NOT EXISTS index_telemetry_frames_fault
                ON telemetry_frames(captured_at_ms)
                WHERE fault_code IS NOT NULL AND fault_code != 0
                """.trimIndent(),
              )
            }

            override fun onOpen(db: SupportSQLiteDatabase) {
              db.execSQL("PRAGMA optimize")
            }
          })
          .build()
          .also { instance = it }
      }
    }

    fun closeAndReset() {
      synchronized(this) {
        instance?.close()
        instance = null
      }
    }
  }
}
