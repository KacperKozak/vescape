import Foundation

/// Time-bucketed min/max decimation of a single metric extracted from telemetry rows. Native owns
/// the live window in memory; this hands the UI a render-ready series (~2×bucketCount points)
/// instead of streaming every raw sample across the JS bridge. Each bucket keeps its min and max
/// sample so peaks and troughs survive, emitted in chronological order.
///
/// Buckets sit on a **fixed absolute grid** (`floor(ts / bucketWidth)`, width = `windowMs /
/// bucketCount`), not a grid anchored to the first row, so a sample's bucket depends only on its
/// own timestamp — as the live window slides and old rows prune, surviving points keep their
/// bucket and the line stays stable instead of re-quantising.
///
/// Output is a flat `[ts0, v0, ts1, v1, ...]` array (timestamps are ms, exact in a Double below
/// 2^53) — the most compact shape for the bridge.
///
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/telemetry/LiveSeriesDownsampler.kt
internal enum LiveSeriesDownsampler {
  static func downsampleMinMax<T>(
    _ rows: [T],
    bucketCount: Int,
    windowMs: Int64,
    timestamp: (T) -> Int64,
    value: (T) -> Double?
  ) -> [Double] {
    if rows.isEmpty || bucketCount <= 0 || windowMs <= 0 { return [] }

    let bucketWidth = Double(windowMs) / Double(bucketCount)
    var out: [Double] = []
    out.reserveCapacity(min(rows.count, bucketCount * 2) * 2)
    var bucketIndex = Int64.min
    var minTs: Int64 = 0
    var minV = Double.nan
    var maxTs: Int64 = 0
    var maxV = Double.nan
    var bucketHasData = false

    for row in rows {
      guard let v = value(row), v.isFinite else { continue }
      let ts = timestamp(row)
      let bucket = Int64(Double(ts) / bucketWidth)

      if bucket != bucketIndex {
        if bucketHasData { flush(&out, minTs, minV, maxTs, maxV) }
        bucketHasData = false
        bucketIndex = bucket
      }

      if !bucketHasData || v < minV { minV = v; minTs = ts }
      if !bucketHasData || v > maxV { maxV = v; maxTs = ts }
      bucketHasData = true
    }

    if bucketHasData { flush(&out, minTs, minV, maxTs, maxV) }
    return out
  }

  private static func flush(
    _ out: inout [Double],
    _ minTs: Int64, _ minV: Double,
    _ maxTs: Int64, _ maxV: Double
  ) {
    if minTs == maxTs && minV == maxV {
      // Same sample (flat bucket): one point.
      out.append(Double(minTs)); out.append(minV)
    } else if minTs <= maxTs {
      // Distinct extremes: emit both in chronological order (min first on ties).
      out.append(Double(minTs)); out.append(minV)
      out.append(Double(maxTs)); out.append(maxV)
    } else {
      out.append(Double(maxTs)); out.append(maxV)
      out.append(Double(minTs)); out.append(minV)
    }
  }
}
