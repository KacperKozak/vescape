package app.vescape.wear

const val WATCH_FRAME_INTERVAL_MS = 500L
const val MIRROR_DISCONNECTED_TIMEOUT_MS = WATCH_FRAME_INTERVAL_MS * 3

enum class MirrorStatus {
    LIVE,
    STALE,
    DISCONNECTED,
}

data class MirrorState(
    val status: MirrorStatus,
    val frame: WatchFrame?,
)

object MirrorStateReducer {
    fun reduce(
        frame: WatchFrame?,
        lastFrameAtMs: Long?,
        nowMs: Long,
        timeoutMs: Long = MIRROR_DISCONNECTED_TIMEOUT_MS,
    ): MirrorState {
        if (frame == null || lastFrameAtMs == null || nowMs - lastFrameAtMs > timeoutMs) {
            return MirrorState(MirrorStatus.DISCONNECTED, null)
        }

        return MirrorState(
            status = if (frame.stale) MirrorStatus.STALE else MirrorStatus.LIVE,
            frame = frame,
        )
    }
}
