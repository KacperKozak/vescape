package app.vescape.wear

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Float32 lane count + order of a Watch Frame:
 *   0 speed, 1 duty, 2 battery, 3 motorTemp, 4 ctrlTemp.
 *
 * Mirrors the phone-side builder (`expo.modules.vescble.WatchFrameBuilder`, `WATCH_FRAME_FIELD_COUNT`)
 * by convention (ADR-0018). Adding or reordering a lane means editing both sides in the same order,
 * or the decode silently misreads. Keep the two lists adjacent in review.
 */
private const val WATCH_FRAME_FIELD_COUNT = 5
private const val WATCH_FRAME_BYTES = 2 + WATCH_FRAME_FIELD_COUNT * 4

/** The decoded Watch Frame. Nullable lanes arrive as `NaN` over the wire (ADR-0018). */
data class WatchFrame(
    val speed: Double,
    val duty: Double?,
    val battery: Double?,
    val motorTemp: Double?,
    val ctrlTemp: Double?,
    val stale: Boolean,
)

/** Pure bytes -> [WatchFrame] decoder. Returns null on a short buffer or a field-count mismatch. */
object WatchFrameDecoder {
    fun decode(bytes: ByteArray): WatchFrame? {
        if (bytes.size < WATCH_FRAME_BYTES) return null
        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        if (buf.get().toInt() != WATCH_FRAME_FIELD_COUNT) return null
        val stale = buf.get().toInt() != 0
        val speed = buf.float.toDouble()
        return WatchFrame(
            speed = speed,
            duty = buf.nullableLane(),
            battery = buf.nullableLane(),
            motorTemp = buf.nullableLane(),
            ctrlTemp = buf.nullableLane(),
            stale = stale,
        )
    }

    private fun ByteBuffer.nullableLane(): Double? = float.let { if (it.isNaN()) null else it.toDouble() }
}
