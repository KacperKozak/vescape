package expo.modules.vescble.telemetry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppSettingsMapPreferencesTest {
  @Test
  fun liveHistoryLimitValidationAcceptsAndClampsNumericMinutes() {
    assertEquals(5, validLiveHistoryLimitMinutes(5))
    assertEquals(1, validLiveHistoryLimitMinutes(-1))
    assertEquals(50, validLiveHistoryLimitMinutes(120))
    assertNull(validLiveHistoryLimitMinutes("5"))
  }

  @Test
  fun mapStyleValidationAcceptsSupportedBasemapsOnly() {
    assertEquals("onedark", validMapStyleKey("onedark"))
    assertEquals("outdoors", validMapStyleKey("outdoors"))
    assertEquals("satellite", validMapStyleKey("satellite"))
    assertEquals("mapy", validMapStyleKey("mapy"))
    assertNull(validMapStyleKey("invalid"))
    assertNull(validMapStyleKey(1))
  }

  @Test
  fun navigationValidationAcceptsSupportedModesOnly() {
    assertEquals("northUp", validMapNavigationMode("northUp"))
    assertEquals("gpsHeading", validMapNavigationMode("gpsHeading"))
    assertEquals("phoneHeading", validMapNavigationMode("phoneHeading"))
    assertEquals("freeRotate", validMapNavigationMode("freeRotate"))
    assertNull(validMapNavigationMode("bearing"))
    assertNull(validMapNavigationMode(false))
  }
}
