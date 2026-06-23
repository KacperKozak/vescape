package expo.modules.vescble.telemetry

/**
 * Time-bucketed min/max decimation of a single metric extracted from telemetry
 * rows. Native owns the live window in memory; this hands the UI a render-ready
 * series (~2×bucketCount points) instead of streaming every raw sample across
 * the JS bridge. Each bucket keeps its min and max sample so peaks and troughs
 * survive, emitted in chronological order.
 *
 * Buckets sit on a **fixed absolute grid** (`floor(ts / bucketWidth)`, width =
 * `windowMs / bucketCount`), not a grid anchored to the first row. A sample's
 * bucket therefore depends only on its own timestamp — as the live window slides
 * and old rows are pruned, every surviving point keeps its bucket, so the line is
 * stable instead of re-quantising (squiggling) on every emit.
 *
 * Output is a flat `[ts0, v0, ts1, v1, ...]` array — the most compact shape for
 * the bridge (timestamps are ms and fit exactly in a Double below 2^53).
 */
object LiveSeriesDownsampler {
    fun <T> downsampleMinMax(
        rows: List<T>,
        bucketCount: Int,
        windowMs: Long,
        timestamp: (T) -> Long,
        value: (T) -> Double?,
    ): DoubleArray {
        if (rows.isEmpty() || bucketCount <= 0 || windowMs <= 0L) return EMPTY

        val bucketWidth = windowMs.toDouble() / bucketCount
        val out = ArrayList<Double>(minOf(rows.size, bucketCount * 2) * 2)
        var bucketIndex = Long.MIN_VALUE
        var minTs = 0L
        var minV = Double.NaN
        var maxTs = 0L
        var maxV = Double.NaN
        var bucketHasData = false

        for (row in rows) {
            val v = value(row) ?: continue
            if (!v.isFinite()) continue
            val ts = timestamp(row)
            val bucket = (ts / bucketWidth).toLong()

            if (bucket != bucketIndex) {
                if (bucketHasData) flush(out, minTs, minV, maxTs, maxV)
                bucketHasData = false
                bucketIndex = bucket
            }

            if (!bucketHasData || v < minV) { minV = v; minTs = ts }
            if (!bucketHasData || v > maxV) { maxV = v; maxTs = ts }
            bucketHasData = true
        }

        if (bucketHasData) flush(out, minTs, minV, maxTs, maxV)
        return out.toDoubleArray()
    }

    private fun flush(out: ArrayList<Double>, minTs: Long, minV: Double, maxTs: Long, maxV: Double) {
        when {
            // Same sample (flat bucket): one point.
            minTs == maxTs && minV == maxV -> { out.add(minTs.toDouble()); out.add(minV) }
            // Distinct extremes: emit both in chronological order (min first on ties).
            minTs <= maxTs -> { out.add(minTs.toDouble()); out.add(minV); out.add(maxTs.toDouble()); out.add(maxV) }
            else -> { out.add(maxTs.toDouble()); out.add(maxV); out.add(minTs.toDouble()); out.add(minV) }
        }
    }

    private val EMPTY = DoubleArray(0)
}
