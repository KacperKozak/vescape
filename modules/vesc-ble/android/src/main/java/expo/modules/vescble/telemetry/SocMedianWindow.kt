package expo.modules.vescble.telemetry

import kotlin.math.roundToInt

/**
 * Median-windowed Battery SoC Estimate (ADR-0016).
 *
 * IR compensation (ADR-0011) leaves residual sag transients that drop the percentage a few
 * points for a few seconds, making the displayed % jump and flapping battery alerts. This holds
 * a trailing window of percentages and returns their median — rejecting brief spikes harder than
 * a mean while lagging the real trend less. Display and alert evaluation both read the median so
 * they never diverge; raw voltage stays the untouched Telemetry Sample.
 *
 * A [windowMs] of 0 disables smoothing: every call returns the latest percentage unchanged.
 */
class SocMedianWindow(@Volatile var windowMs: Long = 20_000L) {
    private data class Sample(val tMs: Long, val bucket: Int)

    private val samples = ArrayDeque<Sample>()
    private val bucketCounts = IntArray(BUCKET_COUNT)
    private var sampleCount = 0

    fun reset() {
        samples.clear()
        bucketCounts.fill(0)
        sampleCount = 0
    }

    /** Adds a sample and returns the median SoC over the trailing window. */
    fun median(percent: Double, nowMs: Long): Double {
        if (windowMs <= 0L) {
            reset()
            return percent
        }
        val bucket = percentBucket(percent)
        samples.addLast(Sample(nowMs, bucket))
        bucketCounts[bucket] += 1
        sampleCount += 1
        while (samples.size > 1 && nowMs - samples.first().tMs > windowMs) {
            val expired = samples.removeFirst()
            bucketCounts[expired.bucket] -= 1
            sampleCount -= 1
        }
        val mid = sampleCount / 2
        return if (sampleCount % 2 == 1) {
            bucketPercent(bucketAtRank(mid))
        } else {
            (bucketPercent(bucketAtRank(mid - 1)) + bucketPercent(bucketAtRank(mid))) / 2.0
        }
    }

    private fun bucketAtRank(rank: Int): Int {
        var seen = 0
        for (bucket in bucketCounts.indices) {
            seen += bucketCounts[bucket]
            if (seen > rank) return bucket
        }
        return MAX_BUCKET
    }

    private fun percentBucket(percent: Double): Int =
        (percent * BUCKET_SCALE).roundToInt().coerceIn(0, MAX_BUCKET)

    private fun bucketPercent(bucket: Int): Double = bucket.toDouble() / BUCKET_SCALE

    companion object {
        private const val BUCKET_SCALE = 10
        private const val MAX_BUCKET = 100 * BUCKET_SCALE
        private const val BUCKET_COUNT = MAX_BUCKET + 1
    }
}
