import Foundation

private let BUCKET_SCALE = 10
private let MAX_BUCKET = 100 * BUCKET_SCALE
private let BUCKET_COUNT = MAX_BUCKET + 1

/// Median-windowed Battery SoC Estimate (ADR-0016).
///
/// IR compensation (ADR-0011) leaves residual sag transients that drop the percentage a few
/// points for a few seconds, making the displayed % jump and flapping battery alerts. This holds
/// a trailing window of percentages and returns their median — rejecting brief spikes harder than
/// a mean while lagging the real trend less. Display and alert evaluation both read the median so
/// they never diverge; raw voltage stays the untouched Telemetry Sample.
///
/// A `windowMs` of 0 disables smoothing: every call returns the latest percentage unchanged.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/telemetry/SocMedianWindow.kt
final class SocMedianWindow {
  private struct Sample { let tMs: Int64; let bucket: Int }

  var windowMs: Int64
  private var samples: [Sample] = []
  private var bucketCounts = [Int](repeating: 0, count: BUCKET_COUNT)
  private var sampleCount = 0

  init(windowMs: Int64 = 20_000) { self.windowMs = windowMs }

  func reset() {
    samples.removeAll(keepingCapacity: true)
    for i in bucketCounts.indices { bucketCounts[i] = 0 }
    sampleCount = 0
  }

  /// Adds a sample and returns the median SoC over the trailing window.
  func median(percent: Double, nowMs: Int64) -> Double {
    if windowMs <= 0 {
      reset()
      return percent
    }
    let bucket = Self.percentBucket(percent)
    samples.append(Sample(tMs: nowMs, bucket: bucket))
    bucketCounts[bucket] += 1
    sampleCount += 1
    while samples.count > 1, nowMs - samples[0].tMs > windowMs {
      let expired = samples.removeFirst()
      bucketCounts[expired.bucket] -= 1
      sampleCount -= 1
    }
    let mid = sampleCount / 2
    if sampleCount % 2 == 1 {
      return Self.bucketPercent(bucketAtRank(mid))
    } else {
      return (Self.bucketPercent(bucketAtRank(mid - 1)) + Self.bucketPercent(bucketAtRank(mid))) / 2.0
    }
  }

  private func bucketAtRank(_ rank: Int) -> Int {
    var seen = 0
    for bucket in bucketCounts.indices {
      seen += bucketCounts[bucket]
      if seen > rank { return bucket }
    }
    return MAX_BUCKET
  }

  private static func percentBucket(_ percent: Double) -> Int {
    min(MAX_BUCKET, max(0, Int((percent * Double(BUCKET_SCALE)).rounded())))
  }

  private static func bucketPercent(_ bucket: Int) -> Double { Double(bucket) / Double(BUCKET_SCALE) }
}
