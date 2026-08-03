package expo.modules.vescapecore.replay

import expo.modules.vescapecore.runtime.SessionClock

import java.util.concurrent.atomic.AtomicLong

/**
 * The [SessionClock] a replay runs on: wall time shifted into the past by the warmup window, then
 * driven forward as the warmup plays until it catches up with real time.
 *
 * Playing the warmup faster than real time is not enough on its own to fill the live charts. Live
 * series are decimated into buckets keyed on the timestamp each sample carries, across a window
 * measured in real minutes, so a three-minute warmup dispatched in two seconds would land as two
 * seconds of samples — a sliver, not a filled window. Shifting the clock instead stamps those
 * samples across the three minutes they actually cover, and the window is genuinely full the moment
 * the warmup ends.
 *
 * The offset stops moving once warmup does, leaving the session running a fixed distance behind
 * wall time for the rest of playback. Both clocks then advance at the same rate, so 1× pacing is
 * unaffected — and freezing is what keeps the timeline continuous, where snapping the offset back to
 * zero would tear a gap into every series at the warmup boundary.
 *
 * @parity /modules/vescape-core/ios/replay/ReplayClock.swift
 */
internal class ReplayClock(private val warmupMs: Long) : SessionClock {
    private val offsetMs = AtomicLong(-warmupMs)
    private val lastNowMs = AtomicLong(Long.MIN_VALUE)

    /**
     * Read from the BLE dispatch thread, the main thread and the scheduler, so the monotonic clamp
     * has to be atomic. Time never running backwards is a contract the whole session leans on:
     * ring buffers prune by comparing timestamps, and a clock that stepped back would drop samples
     * that had only just been written.
     */
    override fun nowMs(): Long {
        val candidate = System.currentTimeMillis() + offsetMs.get()
        return lastNowMs.updateAndGet { maxOf(it, candidate) }
    }

    /**
     * Advance the clock to the point in the recording the warmup has reached. Called by the
     * transport before it dispatches each warmup event, and never again afterwards — that is what
     * freezes the offset for the rest of playback.
     */
    fun advanceWarmup(recordedT: Long, playbackStartedAt: Long) {
        offsetMs.set(playbackStartedAt - warmupMs + recordedT - System.currentTimeMillis())
    }
}
