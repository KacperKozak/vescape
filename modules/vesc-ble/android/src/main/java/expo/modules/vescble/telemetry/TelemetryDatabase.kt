package expo.modules.vescble.telemetry

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
  entities = [
    TelemetryFrameEntity::class,
    HistoryLocationEntity::class,
    TelemetryMinuteBucketEntity::class,
    TelemetryMarkerEntity::class,
    BoardEntity::class,
    AlertRuleEntity::class,
  ],
  version = 3,
  exportSchema = false,
)
abstract class TelemetryDatabase : RoomDatabase() {
  abstract fun telemetryDao(): TelemetryDao

  companion object {
    @Volatile
    private var instance: TelemetryDatabase? = null

    fun get(context: Context): TelemetryDatabase {
      return instance ?: synchronized(this) {
        instance ?: Room.databaseBuilder(
          context.applicationContext,
          TelemetryDatabase::class.java,
          "telemetry.db",
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
  }
}
