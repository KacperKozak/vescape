package expo.modules.vescble

import android.content.Context
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Wear capability our Mirror app declares (watch/wearos res/values/wear.xml). Keep the two in sync. */
internal const val WATCH_MIRROR_CAPABILITY = "vescape_watch_mirror"

/**
 * Re-query cadence: a quick burst right after session start (the window where the watch link is
 * most likely still settling), then a slow steady heartbeat. The CapabilityClient listener stays
 * the instant path; this only backstops missed events.
 */
private val PRESENCE_REFRESH_BURST_MS = longArrayOf(1_000L, 2_000L, 5_000L)
private const val PRESENCE_REFRESH_STEADY_MS = 15_000L

/**
 * Tracks whether a reachable Wear node actually runs our Watch Mirror, gating the phone push (ADR-0019).
 * A *paired* watch is not enough — only a declared [CapabilityClient] capability proves our app is
 * installed and connected, so we never burn Bluetooth/battery pushing frames into the void.
 *
 * Reactive like [VescCompanionPresence] (note: that one tracks a CompanionDeviceManager BLE device —
 * unrelated concept, do not conflate): a [CapabilityClient] listener gives the instant positive, and a
 * slow periodic re-query keeps the cached [present] flag honest — a watch whose Bluetooth link was
 * down at session start must start receiving frames once it comes back, not stay dark all session.
 * The watch tick reads [present] each tick; it never does an async lookup.
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

    private var refreshJob: Job? = null

    private val listener = CapabilityClient.OnCapabilityChangedListener { info ->
        present = info.nodes.isNotEmpty()
        Log.d(VESC_SESSION_TAG, "Watch mirror presence changed: $present")
    }

    fun start() {
        if (refreshJob?.isActive == true) return
        capabilityClient.addListener(listener, WATCH_MIRROR_CAPABILITY)
        refreshJob = scope.launch(Dispatchers.IO) {
            var attempt = 0
            while (isActive) {
                val capabilityPresent = runCatching {
                    Tasks.await(
                        capabilityClient.getCapability(WATCH_MIRROR_CAPABILITY, CapabilityClient.FILTER_REACHABLE),
                    )
                }.getOrNull()?.nodes?.isNotEmpty() ?: false
                val next = capabilityPresent || debugReachableWearNode()
                if (next != present) {
                    Log.d(VESC_SESSION_TAG, "Watch mirror presence refreshed: $next capability=$capabilityPresent")
                }
                present = next
                delay(PRESENCE_REFRESH_BURST_MS.getOrElse(attempt) { PRESENCE_REFRESH_STEADY_MS })
                attempt++
            }
        }
    }

    fun stop() {
        refreshJob?.cancel()
        refreshJob = null
        runCatching { capabilityClient.removeListener(listener, WATCH_MIRROR_CAPABILITY) }
        present = false
    }

    private fun debugReachableWearNode(): Boolean {
        if (!BuildConfig.DEBUG) return false

        val nodes = runCatching { Tasks.await(nodeClient.connectedNodes) }.getOrNull().orEmpty()
        return nodes.isNotEmpty()
    }
}
