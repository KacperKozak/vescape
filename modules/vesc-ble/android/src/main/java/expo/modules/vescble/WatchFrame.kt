package expo.modules.vescble

import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs

/**
 * Number of Float32 lanes in a Watch Frame, in this fixed order:
 *   0 speed, 1 duty, 2 battery, 3 motorTemp, 4 ctrlTemp.
 *
 * The wrist-side decoder ([app.vescape.wear] `WatchFrameDecoder`) carries the same constant and lane
 * order by convention (ADR-0018). Adding or reordering a lane means editing both sides in the same
 * order, or the decode silently misreads. Keep the two lists adjacent in review.
 */
internal const val WATCH_FRAME_FIELD_COUNT = 5

/** Header (1 byte field-count + 1 byte flags) + Float32 lanes, little-endian. */
internal const val WATCH_FRAME_BYTES = 2 + WATCH_FRAME_FIELD_COUNT * 4

/** The decoded Watch Frame model. Nullable numeric lanes ride as `NaN` over the wire (ADR-0018). */
internal data class WatchFrame(
    val speed: Double,
    val duty: Double?,
    val battery: Double?,
    val motorTemp: Double?,
    val ctrlTemp: Double?,
    val stale: Boolean,
)

/** The latest cold-path values the watch tick reads to build a frame. `stale` is decided at tick time. */
internal data class WatchSnapshot(
    val speed: Double,
    val dutyCycle: Double,
    val dutyExcluded: Boolean,
    val batterySoc: Double?,
    val motorTemp: Double?,
    val ctrlTemp: Double?,
)

/**
 * Pure cold-path-snapshot -> Watch Frame builder + compact byte encoder (ADR-0019). Mirrors
 * `LIVE_SERIES_METRICS`: speed/duty are abs (duty also ×100), and duty drops to null when the
 * sample is excluded from `max_duty`, so the wrist shows the same numbers the phone does.
 */
internal object WatchFrameBuilder {
    fun build(snapshot: WatchSnapshot, stale: Boolean): WatchFrame = WatchFrame(
        speed = abs(snapshot.speed),
        duty = if (snapshot.dutyExcluded) null else abs(snapshot.dutyCycle) * 100,
        battery = snapshot.batterySoc,
        motorTemp = snapshot.motorTemp,
        ctrlTemp = snapshot.ctrlTemp,
        stale = stale,
    )

    fun encode(frame: WatchFrame): ByteArray =
        ByteBuffer.allocate(WATCH_FRAME_BYTES).order(ByteOrder.LITTLE_ENDIAN).apply {
            put(WATCH_FRAME_FIELD_COUNT.toByte())
            put(if (frame.stale) 1 else 0)
            putFloat(frame.speed.toFloat())
            putFloat(frame.duty.toLaneFloat())
            putFloat(frame.battery.toLaneFloat())
            putFloat(frame.motorTemp.toLaneFloat())
            putFloat(frame.ctrlTemp.toLaneFloat())
        }.array()

    private fun Double?.toLaneFloat(): Float = this?.toFloat() ?: Float.NaN
}
