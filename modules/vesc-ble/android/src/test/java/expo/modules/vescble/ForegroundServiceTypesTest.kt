package expo.modules.vescble

import android.content.pm.ServiceInfo
import org.junit.Assert.assertEquals
import org.junit.Test

class ForegroundServiceTypesTest {
    @Test
    fun `idle service has no foreground type`() {
        assertEquals(
            0,
            foregroundServiceType(
                boardActive = false,
                gpsActive = false,
                groupRideObserveActive = false,
            ),
        )
    }

    @Test
    fun `board session uses connected device type`() {
        assertEquals(
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
            foregroundServiceType(
                boardActive = true,
                gpsActive = false,
                groupRideObserveActive = false,
            ),
        )
    }

    @Test
    fun `gps adds location type to board session`() {
        assertEquals(
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            foregroundServiceType(
                boardActive = true,
                gpsActive = true,
                groupRideObserveActive = false,
            ),
        )
    }

    @Test
    fun `observe-only group ride uses remote messaging without bluetooth runtime permission`() {
        assertEquals(
            ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING,
            foregroundServiceType(
                boardActive = false,
                gpsActive = false,
                groupRideObserveActive = true,
            ),
        )
    }

    @Test
    fun `connected device promotion keeps active gps location type`() {
        assertEquals(
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            foregroundServiceTypeForConnectedDevicePromotion(
                boardActive = false,
                gpsActive = true,
                groupRideObserveActive = false,
            ),
        )
    }

    @Test
    fun `connected device promotion keeps active observe remote messaging type`() {
        assertEquals(
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING,
            foregroundServiceTypeForConnectedDevicePromotion(
                boardActive = false,
                gpsActive = false,
                groupRideObserveActive = true,
            ),
        )
    }
}
