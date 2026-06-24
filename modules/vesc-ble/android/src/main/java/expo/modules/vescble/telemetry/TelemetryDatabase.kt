package expo.modules.vescble.telemetry

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

internal const val TELEMETRY_DATABASE_NAME = "telemetry.db"
internal const val TELEMETRY_DATABASE_VERSION = 22

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
  ],
  version = TELEMETRY_DATABASE_VERSION,
  exportSchema = false,
)
abstract class TelemetryDatabase : RoomDatabase() {
  abstract fun telemetryDao(): TelemetryDao

  companion object {
    @Volatile
    private var instance: TelemetryDatabase? = null

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

    fun get(context: Context): TelemetryDatabase {
      return instance ?: synchronized(this) {
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
