package expo.modules.vescapecore.watch

import expo.modules.vescapecore.service.VESC_SESSION_TAG

import android.content.Context
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

private const val WATCH_TELEMETRY_PATH = "/telemetry"

/**
 * Phone -> Wear OS Mirror transport (ADR-0019). Fire-and-forget
 * [com.google.android.gms.wearable.MessageClient] send of an already-encoded Watch Frame to every
 * connected node. Lives native (in vescape-core, beside the telemetry truth) so it keeps pushing while
 * JS is backgrounded mid-ride. The frame is built and throttled by [WatchTick]; this only ships bytes.
 *
 * Delivery problems [record] one diagnostic event per issue streak (not per frame — frames flow at
 * ~2 Hz), plus one recovery event, so silent failures like a package/certificate mismatch between
 * phone and watch builds are readable from the in-app event log in the field.
 */
internal class WatchTelemetryPusher(
    private val context: Context,
    private val scope: CoroutineScope,
    private val record: (String, Map<String, Any?>) -> Unit,
) {
    private val messageClient by lazy { Wearable.getMessageClient(context) }
    private val nodeClient by lazy { Wearable.getNodeClient(context) }

    @Volatile
    private var activeIssue: String? = null

    fun pushFrame(frame: ByteArray) {
        scope.launch {
            val nodes = runCatching { Tasks.await(nodeClient.connectedNodes) }.getOrNull()
            if (nodes == null) {
                reportIssue("watch_nodes_lookup_failed")
                return@launch
            }
            if (nodes.isEmpty()) {
                reportIssue("watch_frame_no_nodes")
                return@launch
            }
            for (node in nodes) {
                messageClient.sendMessage(node.id, WATCH_TELEMETRY_PATH, frame)
                    .addOnSuccessListener { reportRecovered() }
                    .addOnFailureListener { error ->
                        reportIssue(
                            "watch_frame_send_failed",
                            mapOf("node" to node.id, "error" to error.message),
                        )
                    }
            }
        }
    }

    private fun reportIssue(name: String, properties: Map<String, Any?> = emptyMap()) {
        if (activeIssue != name) {
            Log.w(VESC_SESSION_TAG, "Watch push issue $name $properties")
            record(name, properties)
        }
        activeIssue = name
    }

    private fun reportRecovered() {
        if (activeIssue != null) {
            Log.d(VESC_SESSION_TAG, "Watch push recovered after $activeIssue")
            record("watch_frame_send_recovered", emptyMap())
        }
        activeIssue = null
    }
}
