package expo.modules.vescble.telemetry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class BoardLinkPersistenceTest {
  private fun roundTrip(link: Map<String, Any?>): Map<*, *>? {
    val board = mapOf(
      "id" to "b1",
      "name" to "Board",
      "createdAt" to 0L,
      "link" to link,
    )
    val (settings, _) = board.toBoardSettingEntities("b1")
    return board.toBoardEntity().toMap(settings)["link"] as? Map<*, *>
  }

  @Test
  fun hasBmsSurvivesRoundTrip() {
    val link = roundTrip(mapOf("bleId" to "AA:BB", "transport" to 84, "hasBms" to true))

    assertNotNull(link)
    assertEquals("AA:BB", link?.get("bleId"))
    assertEquals(true, link?.get("hasBms"))
  }

  @Test
  fun hasBmsFalseSurvivesRoundTrip() {
    val link = roundTrip(mapOf("bleId" to "AA:BB", "transport" to 84, "hasBms" to false))

    assertEquals(false, link?.get("hasBms"))
  }

  @Test
  fun legacyLinkWithoutHasBmsReadsAsUnknown() {
    val link = roundTrip(mapOf("bleId" to "AA:BB", "transport" to 84))

    assertNotNull(link)
    assertNull(link?.get("hasBms"))
  }
}
