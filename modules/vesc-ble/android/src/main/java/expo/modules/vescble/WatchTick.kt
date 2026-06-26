package expo.modules.vescble

import expo.modules.vescble.runtime.BoardSession
import expo.modules.vescble.runtime.Cancellable
import expo.modules.vescble.runtime.Scheduler
import expo.modules.vescble.runtime.postDelayedForSession

/**
 * Dedicated watch tick (ADR-0013/0019): a session-scoped scheduler, independent of the board poll
 * rate, that reads the latest cold-path [WatchSnapshot] and pushes an encoded Watch Frame at a fixed
 * cadence. Adds no hot-path cost — it only reads already-sanitized cold-path state. Making the
 * interval configurable is a later slice.
 *
 * Capability-gated: [canPush] is a cached flag ([WatchMirrorPresence]) checked before building the
 * frame, so when no Mirror is reachable the tick keeps spinning but skips both encode and send.
 */
internal class WatchTick(
    private val scheduler: Scheduler,
    private val session: () -> BoardSession?,
    private val isCurrentSession: (BoardSession) -> Boolean,
    private val snapshot: () -> WatchSnapshot?,
    private val isStale: () -> Boolean,
    private val canPush: () -> Boolean,
    private val push: (ByteArray) -> Unit,
    private val intervalMs: Long,
) {
    private var handle: Cancellable? = null

    fun start() {
        if (handle == null) schedule()
    }

    fun stop() {
        handle?.cancel()
        handle = null
    }

    private fun schedule() {
        val token = session() ?: return
        handle = scheduler.postDelayedForSession(token, intervalMs, isCurrentSession) {
            val snap = snapshot()
            if (snap != null && canPush()) push(WatchFrameBuilder.encode(WatchFrameBuilder.build(snap, isStale())))
            schedule()
        }
    }
}
