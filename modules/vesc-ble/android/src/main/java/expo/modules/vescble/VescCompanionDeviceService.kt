package expo.modules.vescble

import android.annotation.SuppressLint
import android.companion.CompanionDeviceService
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.S)
@Suppress("DEPRECATION")
class VescCompanionDeviceService : CompanionDeviceService() {
    @SuppressLint("MissingPermission")
    override fun onDeviceAppeared(address: String) {
        Log.d(VESC_SESSION_TAG, "Companion device appeared: $address")
        VescForegroundService.onCompanionDeviceAppeared(applicationContext, address)
    }

    override fun onDeviceDisappeared(address: String) {
        Log.d(VESC_SESSION_TAG, "Companion device disappeared: $address")
    }
}
