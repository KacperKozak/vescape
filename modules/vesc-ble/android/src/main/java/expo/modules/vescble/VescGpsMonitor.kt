package expo.modules.vescble

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat

internal class VescGpsMonitor(
    private val context: Context,
    private val looper: Looper,
    onLocation: (Location) -> Unit,
) {
    private val locationListener = LocationListener { location -> onLocation(location) }
    private var locationManager: LocationManager? = null

    val active: Boolean
        get() = locationManager != null

    fun start(): String? {
        val hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (!hasFine) return "Location permission not granted"

        val lm = (context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager) ?: return null
        locationManager = lm
        try {
            lm.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                1000L,
                0f,
                locationListener,
                looper,
            )
            lm.requestLocationUpdates(
                LocationManager.NETWORK_PROVIDER,
                2000L,
                0f,
                locationListener,
                looper,
            )
        } catch (e: Exception) {
            locationManager = null
            val message = e.message ?: "Location updates failed"
            Log.w(VESC_SESSION_TAG, "Location updates failed: ${e.message}")
            return message
        }
        return null
    }

    fun stop() {
        val lm = locationManager ?: return
        try {
            lm.removeUpdates(locationListener)
        } catch (_: Exception) {
        }
        locationManager = null
    }
}
