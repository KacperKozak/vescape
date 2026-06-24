package expo.modules.vescble

import expo.modules.vescble.runtime.Cancellable
import expo.modules.vescble.runtime.Scheduler
import kotlin.math.roundToInt

private const val REMOTE_TILT_REPEAT_MS = 40L

/**
 * Streams Floaty's temporary remote-tilt input (0..255 slider, 128 neutral) to
 * the board. Refloat drops the remote input after ~1s of silence, so the active
 * tilt is repeated on a fixed [REMOTE_TILT_REPEAT_MS] tick. Requires
 * `inputtilt_remote_type` to be set to UART in the board config.
 *
 * Two streams drive the 2D pad:
 *  - [hold] keeps a constant tilt while the finger is down (live drag).
 *  - [release] eases that tilt linearly back to neutral over a chosen duration
 *    once the finger lifts.
 *
 * The repeat loop is the sole sender: rapid drag updates only swap the active
 * stream and never schedule extra writes, so the serialized GATT queue is not
 * flooded with stale packets (which lagged the board the longer it was dragged).
 *
 * Decay is tick-based rather than wall-clock: ticks fire at a fixed interval, so
 * counting them is equivalent to timing for a linear ramp and stays trivially
 * testable.
 *
 * @param transport supplies the active transport only while a tilt stream is
 *   allowed (board connected with a loaded config); `null` otherwise.
 * @param send writes a framed payload to the board, returning whether it was sent.
 */
internal class RemoteTiltController(
    private val scheduler: Scheduler,
    private val transport: () -> BoardTransport?,
    private val send: (ByteArray) -> Boolean,
) {
    /** The tilt currently being streamed, as a function of elapsed ticks. */
    private sealed interface Stream {
        /** Tilt value to emit [tick] repeats into the stream. */
        fun valueAt(tick: Int): Int

        /** Whether the stream has reached neutral and should stop after [tick]. */
        fun finished(tick: Int): Boolean

        /** Constant tilt held while the finger is down. */
        data class Hold(val value: Int) : Stream {
            override fun valueAt(tick: Int) = value

            override fun finished(tick: Int) = false
        }

        /** Linear ease from [from] to neutral over [steps] ticks. */
        data class Decay(val from: Int, val steps: Int) : Stream {
            override fun valueAt(tick: Int): Int {
                if (tick >= steps) return REMOTE_TILT_CENTER
                val progress = tick.toDouble() / steps
                return (from + (REMOTE_TILT_CENTER - from) * progress).roundToInt()
            }

            override fun finished(tick: Int) = tick >= steps
        }
    }

    private var stream: Stream? = null
    private var tick = 0
    private var repeat: Cancellable? = null

    /** Hold a constant tilt (live pad drag). Streams until [release] or [stop]. */
    fun hold(value: Int): Boolean = start(Stream.Hold(value.coerceIn(0, 255)))

    /**
     * Release the pad into a linear ease from [value] back to neutral over
     * [durationMs]. A duration shorter than one tick snaps straight to neutral.
     */
    fun release(value: Int, durationMs: Long): Boolean {
        val steps = (durationMs / REMOTE_TILT_REPEAT_MS).toInt()
        if (steps <= 0) return stop()
        return start(Stream.Decay(value.coerceIn(0, 255), steps))
    }

    fun stop(): Boolean {
        val wasActive = stream != null
        clear()

        // Snap to neutral so the board releases tilt immediately instead of
        // waiting for its ~1s remote-input timeout.
        transport()?.let { send(buildRemoteTiltCommand(it, REMOTE_TILT_CENTER)) }
        return wasActive
    }

    private fun start(next: Stream): Boolean {
        val transport = transport() ?: return false

        // A running loop just picks up the new stream on its next tick; swapping
        // mid-drag must not flood the queue with an extra immediate write.
        val alreadyStreaming = repeat != null
        stream = next
        tick = 0
        if (alreadyStreaming) return true

        val sent = send(buildRemoteTiltCommand(transport, next.valueAt(0)))
        scheduleRepeat()
        return sent
    }

    private fun scheduleRepeat() {
        repeat = scheduler.postDelayed(REMOTE_TILT_REPEAT_MS) {
            val stream = stream
            val transport = transport()
            if (stream == null || transport == null) {
                clear()
                return@postDelayed
            }
            tick += 1
            send(buildRemoteTiltCommand(transport, stream.valueAt(tick)))
            if (stream.finished(tick)) {
                clear()
                return@postDelayed
            }
            scheduleRepeat()
        }
    }

    private fun clear() {
        stream = null
        tick = 0
        repeat?.cancel()
        repeat = null
    }
}
