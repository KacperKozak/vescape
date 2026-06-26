package app.vescape.wear

import android.os.SystemClock
import androidx.compose.runtime.mutableStateOf

/** MessageClient path the phone pushes Watch Frames on. Must match the phone-side WatchTelemetryPusher. */
const val TELEMETRY_PATH = "/telemetry"

/**
 * Latest wrist-visible Mirror State. Frames update it on receipt; the UI also ticks the clock so a
 * stopped stream becomes disconnected without an explicit phone message.
 */
object TelemetryState {
    val mirrorState = mutableStateOf(MirrorStateReducer.reduce(null, null, nowMs()))

    private var latestFrame: WatchFrame? = null
    private var lastFrameAtMs: Long? = null

    fun acceptFrame(frame: WatchFrame, nowMs: Long = nowMs()) {
        latestFrame = frame
        lastFrameAtMs = nowMs
        refresh(nowMs)
    }

    fun refresh(nowMs: Long = nowMs()) {
        mirrorState.value = MirrorStateReducer.reduce(latestFrame, lastFrameAtMs, nowMs)
    }

    private fun nowMs(): Long = SystemClock.elapsedRealtime()
}
