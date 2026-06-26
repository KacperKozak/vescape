package app.vescape.wear

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.mutableStateOf
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.content.ContextCompat
import androidx.wear.ambient.AmbientLifecycleObserver
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.Wearable

/**
 * Wear OS Mirror entry point. Renders the live [WatchFrame] pushed from the phone over
 * [MessageClient] on [TELEMETRY_PATH] while the screen is on. Reception only runs while the
 * activity is resumed — the background-survivable transport lives on the phone side.
 */
class MainActivity : ComponentActivity() {
    private val messageClient by lazy { Wearable.getMessageClient(this) }
    private val ongoingActivityController by lazy { OngoingActivityController(this) }
    private val isAmbient = mutableStateOf(false)
    private val ambientObserver = AmbientLifecycleObserver(this, AmbientCallback())
    private val requestPostNotifications = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { isGranted ->
        if (isGranted) ongoingActivityController.start()
    }

    private val listener = MessageClient.OnMessageReceivedListener { event ->
        if (event.path != TELEMETRY_PATH) return@OnMessageReceivedListener
        WatchFrameDecoder.decode(event.data)?.let { frame ->
            runOnUiThread { TelemetryState.acceptFrame(frame, SystemClock.elapsedRealtime()) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        lifecycle.addObserver(ambientObserver)
        setContent {
            MirrorScreen(
                isAmbient = isAmbient.value,
                onKeepScreenAwakeChanged = ::setKeepScreenAwake,
            )
        }
        startOngoingActivityWhenAllowed()
    }

    override fun onStart() {
        super.onStart()
        messageClient.addListener(listener)
    }

    override fun onStop() {
        messageClient.removeListener(listener)
        super.onStop()
    }

    override fun onDestroy() {
        lifecycle.removeObserver(ambientObserver)
        setKeepScreenAwake(false)
        ongoingActivityController.stop()
        super.onDestroy()
    }

    private fun startOngoingActivityWhenAllowed() {
        if (canPostNotifications()) {
            ongoingActivityController.start()
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPostNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun canPostNotifications(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    private fun setKeepScreenAwake(keepAwake: Boolean) {
        if (keepAwake) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    private inner class AmbientCallback : AmbientLifecycleObserver.AmbientLifecycleCallback {
        override fun onEnterAmbient(ambientDetails: AmbientLifecycleObserver.AmbientDetails) {
            isAmbient.value = true
        }

        override fun onExitAmbient() {
            isAmbient.value = false
        }
    }
}
