package expo.modules.vescapecore.service

import android.content.pm.ServiceInfo
import org.junit.Assert.assertEquals
import org.junit.Test

class ForegroundServiceTypesTest {
    @Test
    fun `idle service has no foreground type`() {
        assertEquals(
            0,
            foregroundServiceType(boardActive = false, gpsActive = false),
        )
    }

    @Test
    fun `board session uses connected device type`() {
        assertEquals(
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
            foregroundServiceType(boardActive = true, gpsActive = false),
        )
    }

    @Test
    fun `gps adds location type to board session`() {
        assertEquals(
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            foregroundServiceType(boardActive = true, gpsActive = true),
        )
    }

    @Test
    fun `gps alone uses location type`() {
        assertEquals(
            ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            foregroundServiceType(boardActive = false, gpsActive = true),
        )
    }

    @Test
    fun `connected device promotion keeps active gps location type`() {
        assertEquals(
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            foregroundServiceTypeForConnectedDevicePromotion(boardActive = false, gpsActive = true),
        )
    }

    @Test
    fun `connected device promotion without gps yields connected device type`() {
        assertEquals(
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
            foregroundServiceTypeForConnectedDevicePromotion(boardActive = false, gpsActive = false),
        )
    }
}
