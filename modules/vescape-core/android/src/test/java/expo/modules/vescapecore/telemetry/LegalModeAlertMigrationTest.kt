package expo.modules.vescapecore.telemetry

import androidx.sqlite.db.SupportSQLiteDatabase
import java.lang.reflect.Proxy
import org.junit.Assert.assertEquals
import org.junit.Test

class LegalModeAlertMigrationTest {
  @Test
  fun migrationDeletesOnlyLegacyMaterializedLegalModeRules() {
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

    assertEquals(
      listOf("DELETE FROM alerts WHERE id = 'legal-mode-speed-alert' OR source = 'legal-mode'"),
      sql,
    )
  }
}
