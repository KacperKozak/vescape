package expo.modules.vescapecore.location

import android.location.LocationManager
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GpsPrecisionTest {
    @Test
    fun acceptsGpsProviderAtAccuracyLimit() {
        assertTrue(isPreciseGpsFix(LocationManager.GPS_PROVIDER, MAX_RECORDING_ACCURACY_M))
    }

    @Test
    fun rejectsNetworkProviderEvenWhenAccurate() {
        assertFalse(isPreciseGpsFix(LocationManager.NETWORK_PROVIDER, 5.0))
    }

    @Test
    fun rejectsMissingOrPoorAccuracy() {
        assertFalse(isPreciseGpsFix(LocationManager.GPS_PROVIDER, null))
        assertFalse(isPreciseGpsFix(LocationManager.GPS_PROVIDER, MAX_RECORDING_ACCURACY_M + 0.1))
    }
}
