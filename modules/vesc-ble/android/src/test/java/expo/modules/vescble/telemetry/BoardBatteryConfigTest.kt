package expo.modules.vescble.telemetry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import androidx.sqlite.db.SupportSQLiteDatabase
import java.lang.reflect.Proxy

class BoardBatteryConfigTest {
  @Test
  fun rejectsInvalidBatteryConfig() {
    assertNull(
      encodeBatteryConfig(mapOf("mode" to "manual", "minVoltage" to 84, "maxVoltage" to 60)),
    )
    assertNull(
      encodeBatteryConfig(
        mapOf("mode" to "preset", "cellPresetId" to "", "seriesCount" to 20, "parallelCount" to 2),
      ),
    )
  }

  @Test
  fun acceptsValidPresetBatteryConfig() {
    val config = normalizeBatteryConfig(
      mapOf(
        "mode" to "preset",
        "cellPresetId" to "molicel:21700:p50b",
        "seriesCount" to 20,
        "parallelCount" to 2,
      ),
    )

    assertEquals("preset", config?.get("mode"))
    assertEquals("molicel:21700:p50b", config?.get("cellPresetId"))
    assertEquals(20, config?.get("seriesCount"))
    assertEquals(2, config?.get("parallelCount"))
  }

  @Test
  fun acceptsValidManualBatteryConfig() {
    val config = normalizeBatteryConfig(
      mapOf("mode" to "manual", "minVoltage" to 58.0, "maxVoltage" to 82.0),
    )

    assertEquals("manual", config?.get("mode"))
    assertEquals(58.0, config?.get("minVoltage"))
    assertEquals(82.0, config?.get("maxVoltage"))
  }

  @Test
  fun migrationResetsExistingBoardBatteryConfigOnly() {
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
    TelemetryDatabase.MIGRATION_18_19.migrate(db)

    assertTrue(sql.any { it.contains("CREATE TABLE IF NOT EXISTS boards_new") })
    assertTrue(sql.any { it.contains("battery_config_json TEXT") })
    assertTrue(
      sql.any { it.contains("SELECT id, name, description, ble_id, is_starred, created_at, NULL") },
    )
    assertTrue(sql.any { it == "DROP TABLE boards" })
    assertTrue(sql.any { it == "ALTER TABLE boards_new RENAME TO boards" })
    assertTrue(
      sql.any { it == "CREATE INDEX IF NOT EXISTS index_boards_created_at ON boards(created_at)" },
    )
    assertTrue(
      sql.any { it == "CREATE INDEX IF NOT EXISTS index_boards_is_starred ON boards(is_starred)" },
    )
  }
}
