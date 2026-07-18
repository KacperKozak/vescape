package expo.modules.vescapecore.service

import android.annotation.SuppressLint
import android.companion.CompanionDeviceService
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.S)
@Suppress("DEPRECATION")
class BoardCompanionDeviceService : CompanionDeviceService() {
    @SuppressLint("MissingPermission")
    override fun onDeviceAppeared(address: String) {
        Log.d(VESC_SESSION_TAG, "Companion device appeared: $address")
        CoreForegroundService.onCompanionDeviceAppeared(applicationContext, address)
    }

    override fun onDeviceDisappeared(address: String) {
        Log.d(VESC_SESSION_TAG, "Companion device disappeared: $address")
    }
}
