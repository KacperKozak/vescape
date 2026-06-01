package expo.modules.vescble.telemetry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import androidx.sqlite.db.SupportSQLiteDatabase
import java.lang.reflect.Proxy

class MapPointEntityTest {
  @Test
  fun mapPointEntityRoundTripsBridgeShape() {
    val entity = mapOf(
      "id" to "point-1",
      "kind" to "charging_food",
      "latitude" to 52.2297,
      "longitude" to 21.0122,
      "createdAt" to 1000L,
      "updatedAt" to 2000L,
    ).toMapPointEntity()

    assertEquals("point-1", entity.id)
    assertEquals("charging_food", entity.kind)
    assertEquals(522297000, entity.latitudeE7)
    assertEquals(210122000, entity.longitudeE7)
    assertEquals(1000L, entity.createdAt)
    assertEquals(2000L, entity.updatedAt)
    assertEquals(
      mapOf(
        "id" to "point-1",
        "kind" to "charging_food",
        "latitude" to 52.2297,
        "longitude" to 21.0122,
        "createdAt" to 1000L,
        "updatedAt" to 2000L,
      ),
      entity.toMap(),
    )
  }

  @Test
  fun mapPointEntityRejectsUnknownKind() {
    assertThrows(IllegalArgumentException::class.java) {
      mapOf(
        "id" to "point-1",
        "kind" to "marker",
        "latitude" to 52.2297,
        "longitude" to 21.0122,
      ).toMapPointEntity()
    }
  }

  @Test
  fun mapPointEntityRejectsInvalidCoordinates() {
    assertThrows(IllegalArgumentException::class.java) {
      mapOf(
        "id" to "point-1",
        "kind" to "drop",
        "latitude" to Double.NaN,
        "longitude" to 21.0122,
      ).toMapPointEntity()
    }
  }

  @Test
  fun directionReplacementCoercesKindAtBridgeBoundary() {
    val entity = mapOf(
      "id" to "direction-1",
      "kind" to "drop",
      "latitude" to 52.2297,
      "longitude" to 21.0122,
      "createdAt" to 1000L,
      "updatedAt" to 2000L,
    ).toDirectionMapPointEntity()

    assertEquals("direction", entity.kind)
    assertEquals("direction-1", entity.id)
    assertEquals(522297000, entity.latitudeE7)
    assertEquals(210122000, entity.longitudeE7)
    assertEquals(1000L, entity.createdAt)
    assertEquals(2000L, entity.updatedAt)
  }

  @Test
  fun migrationAddsMapPointsTableAndKindIndex() {
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

    TelemetryDatabase.MIGRATION_19_20.migrate(db)

    assertTrue(sql.any { it.contains("CREATE TABLE IF NOT EXISTS map_points") })
    assertTrue(sql.any { it.contains("id TEXT NOT NULL PRIMARY KEY") })
    assertTrue(sql.any { it.contains("kind TEXT NOT NULL") })
    assertTrue(sql.any { it.contains("latitude_e7 INTEGER NOT NULL") })
    assertTrue(sql.any { it.contains("longitude_e7 INTEGER NOT NULL") })
    assertTrue(
      sql.any {
        it == "CREATE INDEX IF NOT EXISTS index_map_points_kind ON map_points(kind)"
      },
    )
  }
}
