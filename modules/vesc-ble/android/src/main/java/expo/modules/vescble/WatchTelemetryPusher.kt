package expo.modules.vescble

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

private const val WATCH_TELEMETRY_PATH = "/telemetry"

/**
 * Phone -> Wear OS Mirror transport (ADR-0019). Fire-and-forget
 * [com.google.android.gms.wearable.MessageClient] send of an already-encoded Watch Frame to every
 * connected node. Lives native (in vesc-ble, beside the telemetry truth) so it keeps pushing while
 * JS is backgrounded mid-ride. The frame is built and throttled by [WatchTick]; this only ships bytes.
 */
internal class WatchTelemetryPusher(
    private val context: Context,
    private val scope: CoroutineScope,
) {
    private val messageClient by lazy { Wearable.getMessageClient(context) }
    private val nodeClient by lazy { Wearable.getNodeClient(context) }

    fun pushFrame(frame: ByteArray) {
        scope.launch {
            val nodes = runCatching { Tasks.await(nodeClient.connectedNodes) }.getOrNull() ?: return@launch
            for (node in nodes) {
                messageClient.sendMessage(node.id, WATCH_TELEMETRY_PATH, frame)
            }
        }
    }
}
