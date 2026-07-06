package expo.modules.vescble

import android.content.Context
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** Wear capability our Mirror app declares (watch/wearos res/values/wear.xml). Keep the two in sync. */
internal const val WATCH_MIRROR_CAPABILITY = "vescape_watch_mirror"

/**
 * Tracks whether a reachable Wear node actually runs our Watch Mirror, gating the phone push (ADR-0019).
 * A *paired* watch is not enough — only a declared [CapabilityClient] capability proves our app is
 * installed and connected, so we never burn Bluetooth/battery pushing frames into the void.
 *
 * Reactive like [VescCompanionPresence] (note: that one tracks a CompanionDeviceManager BLE device —
 * unrelated concept, do not conflate): one initial query plus a [CapabilityClient] listener keep the
 * cached [present] flag fresh. The watch tick reads [present] each tick; it never does an async lookup.
 */
internal class WatchMirrorPresence(
    private val context: Context,
    private val scope: CoroutineScope,
) {
    private val capabilityClient by lazy { Wearable.getCapabilityClient(context) }
    private val nodeClient by lazy { Wearable.getNodeClient(context) }

    @Volatile
    var present: Boolean = false
        private set

    private val listener = CapabilityClient.OnCapabilityChangedListener { info ->
        present = info.nodes.isNotEmpty()
        Log.d(VESC_SESSION_TAG, "Watch mirror presence changed: $present")
    }

    fun start() {
        capabilityClient.addListener(listener, WATCH_MIRROR_CAPABILITY)
        scope.launch(Dispatchers.IO) {
            val capabilityPresent = runCatching {
                Tasks.await(
                    capabilityClient.getCapability(WATCH_MIRROR_CAPABILITY, CapabilityClient.FILTER_REACHABLE),
                )
            }.getOrNull()?.nodes?.isNotEmpty() ?: false
            present = capabilityPresent || debugReachableWearNode()
            Log.d(VESC_SESSION_TAG, "Watch mirror presence initial: $present capability=$capabilityPresent")
        }
    }

    fun stop() {
        runCatching { capabilityClient.removeListener(listener, WATCH_MIRROR_CAPABILITY) }
        present = false
    }

    private fun debugReachableWearNode(): Boolean {
        if (!BuildConfig.DEBUG) return false

        val nodes = runCatching { Tasks.await(nodeClient.connectedNodes) }.getOrNull().orEmpty()
        val fallback = nodes.isNotEmpty()
        Log.d(VESC_SESSION_TAG, "Watch mirror debug node fallback: $fallback nodes=${nodes.size}")
        return fallback
    }
}
