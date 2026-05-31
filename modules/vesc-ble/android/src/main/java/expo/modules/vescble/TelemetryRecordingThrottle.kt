package expo.modules.vescble

internal class TelemetryRecordingThrottle(
    private val intervalMs: Long = DEFAULT_RECORDING_INTERVAL_MS,
) {
    private var lastRecordedAt: Long? = null

    fun shouldRecord(now: Long): Boolean {
        val last = lastRecordedAt
        if (last != null && now - last < intervalMs) return false
        lastRecordedAt = now
        return true
    }

    fun reset() {
        lastRecordedAt = null
    }
}

private const val DEFAULT_RECORDING_INTERVAL_MS = 100L
