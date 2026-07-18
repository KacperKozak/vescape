package expo.modules.vescapecore.watch

import expo.modules.vescapecore.runtime.BoardSession
import expo.modules.vescapecore.runtime.Cancellable
import expo.modules.vescapecore.runtime.Scheduler
import expo.modules.vescapecore.runtime.postDelayedForSession

/**
 * Dedicated watch tick (ADR-0013/0019): a session-scoped scheduler, independent of the board poll
 * rate, that reads the latest cold-path [WatchSnapshot] and pushes an encoded Watch Frame at a
 * configurable cadence (`wearMirrorIntervalMs` App Setting). Adds no hot-path cost — it only reads
 * already-sanitized cold-path state. While the session has no telemetry yet (connect phase) it
 * pushes a waiting frame instead, so the wrist can show "connecting to board" rather than a bare
 * spinner.
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
    intervalMs: Long,
) {
    private var handle: Cancellable? = null
    private var intervalMs: Long = intervalMs

    fun start() {
        if (handle == null) schedule()
    }

    fun stop() {
        handle?.cancel()
        handle = null
    }

    /**
     * Live-update the push cadence. Re-arms the active tick (cancel + reschedule) so a lowered
     * interval takes effect immediately instead of waiting out the current, possibly longer, delay.
     */
    fun setIntervalMs(intervalMs: Long) {
        if (intervalMs == this.intervalMs) return
        this.intervalMs = intervalMs
        if (handle != null) {
            handle?.cancel()
            handle = null
            schedule()
        }
    }

    private fun schedule() {
        val token = session() ?: return
        handle = scheduler.postDelayedForSession(token, intervalMs, isCurrentSession) {
            if (canPush()) {
                val snap = snapshot()
                val frame = if (snap != null) WatchFrameBuilder.build(snap, isStale()) else WatchFrameBuilder.waitingFrame()
                push(WatchFrameBuilder.encode(frame))
            }
            schedule()
        }
    }
}
