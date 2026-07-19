package expo.modules.vescapecore.replay

import expo.modules.vescapecore.protocol.SessionTransport
import expo.modules.vescapecore.protocol.VescGattListener
import expo.modules.vescapecore.service.VESC_SESSION_TAG

import android.content.Context
import android.os.Handler
import android.util.Log

/** Wall-clock tail after the last recorded chunk before the replay disconnects the session. */
private const val REPLAY_END_TAIL_MS = 250L

/**
 * Dev-mode [SessionTransport] that plays a Debug Recording through the real session stack
 * (ADR 0024): fakes the connect/subscribing/ready callbacks, emits recorded `rx` chunks at their
 * recorded `t` offsets at 1× real time, swallows writes, and ends the session like a real
 * disconnect when the recording runs out. The replay session runs with `recordingEnabled = false`
 * so playback never records a new Debug Recording of itself.
 *
 * @parity /modules/vescape-core/ios/replay/ReplayTransport.swift
 */
internal class ReplayTransport(
    private val context: Context,
    private val handler: Handler,
    private val recordingName: String,
    private val listener: VescGattListener,
    private val dispatchListener: ((() -> Unit) -> Unit),
) : SessionTransport {
    @Volatile
    private var cancelled = false
    private var pending: Runnable? = null
    private var playbackStartedAt = 0L

    override fun connect(deviceId: String) {
        Log.d(VESC_SESSION_TAG, "replay connect recording=$recordingName")
        // Decode off-main (a ride recording can be megabytes); playback runs on the handler.
        Thread({
            val chunks = try {
                ReplayChunkDecoder.rxChunks(ReplayRecordings.read(context, recordingName))
            } catch (e: Exception) {
                Log.w(VESC_SESSION_TAG, "replay load failed: ${e.message}")
                dispatchListener { listener.onGattFailure("REPLAY_LOAD_FAILED", e.message ?: "Recording unreadable") }
                return@Thread
            }
            handler.post { startPlayback(chunks) }
        }, "vesc-replay-load").start()
    }

    private fun startPlayback(chunks: List<ReplayChunk>) {
        if (cancelled) return
        dispatchListener { listener.onGattConnected() }
        dispatchListener { listener.onGattSubscribing() }
        dispatchListener { listener.onGattReady() }
        playbackStartedAt = System.currentTimeMillis()
        scheduleNext(chunks, 0)
    }

    /**
     * Cursor-based pacing: only the next chunk is ever scheduled, so an hour-long recording never
     * floods the handler with queued callbacks. Recorded `t` is relative to recording start;
     * scheduling against `playbackStartedAt` preserves the original absolute pacing (including the
     * recorded connect handshake gap) at 1× real time.
     */
    private fun scheduleNext(chunks: List<ReplayChunk>, index: Int) {
        if (cancelled) return
        if (index >= chunks.size) {
            postAt((chunks.lastOrNull()?.t ?: 0L) + REPLAY_END_TAIL_MS) {
                Log.d(VESC_SESSION_TAG, "replay finished recording=$recordingName chunks=${chunks.size}")
                dispatchListener { listener.onGattDisconnected(status = 0, intentional = false) }
            }
            return
        }
        val chunk = chunks[index]
        postAt(chunk.t) {
            dispatchListener { listener.onGattFrameChunk(chunk.bytes) }
            scheduleNext(chunks, index + 1)
        }
    }

    private fun postAt(recordedT: Long, block: () -> Unit) {
        val delayMs = (playbackStartedAt + recordedT - System.currentTimeMillis()).coerceAtLeast(0L)
        val runnable = Runnable { if (!cancelled) { pending = null; block() } }
        pending = runnable
        handler.postDelayed(runnable, delayMs)
    }

    /** Replay swallows all writes; request/response FSMs get replies on the recording's schedule. */
    override fun sendPayload(payload: ByteArray): Boolean = !cancelled

    override fun sendRemoteTilt(payload: ByteArray, urgent: Boolean): Boolean = !cancelled

    override fun clear(markIntentional: Boolean) {
        cancelled = true
        pending?.let(handler::removeCallbacks)
        pending = null
    }
}
