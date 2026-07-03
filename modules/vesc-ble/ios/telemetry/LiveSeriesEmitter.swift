import Foundation

/// Keeps a rolling in-memory window of recent telemetry ticks and, ~1 Hz, emits a per-metric
/// decimated `onLiveSeries` event (flat `[ts, value, ...]` arrays over `LIVE_SERIES_BUCKETS`
/// buckets across the live-history window). This is what the center-screen sparklines and the
/// battery gauge read — `onLiveTick` only carries the instant scalar for the numeric gauges.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/LiveSeriesEmitter.kt
/// @platform-diff iOS decimates a plain in-memory tick buffer instead of Android's `TelemetryPipeline`,
/// and has no metric-sanitizer exclusions yet (speed/duty are emitted unconditionally). The event
/// shape, cadence, bucket count, and window semantics match.
internal final class LiveSeriesEmitter {
  private static let intervalMs = 1_000
  private static let buckets = 64

  /// Send a native event to JS. Wired by the coordinator.
  var emit: ((String, [String: Any?]) -> Void)?
  /// Current connection generation, stamped onto each emit so JS can drop stale series.
  var generation: () -> Int64 = { 0 }

  private var windowMs: Int64 = 5 * 60_000
  private var samples: [[String: Any?]] = []
  private var active = false
  private var primed = false
  private var tickSeq = 0

  /// Set the live-history window (minutes) from the `liveHistoryLimit` setting.
  func setWindowMinutes(_ minutes: Int) {
    windowMs = Int64(max(1, minutes)) * 60_000
    prune()
  }

  func start() {
    guard !active else { return }
    active = true
    primed = false
    scheduleTick()
  }

  func stop() {
    active = false
    primed = false
    tickSeq &+= 1
    samples.removeAll(keepingCapacity: true)
  }

  /// Append a decoded tick (the same map emitted on `onLiveTick`, carrying `lastPacketAt` plus the
  /// metric fields). Emits immediately on the first sample of a session so gauges light up without
  /// waiting a full tick interval.
  func add(_ sample: [String: Any?]) {
    samples.append(sample)
    prune()
    if active && !primed {
      primed = true
      emitSeries()
    }
  }

  private func prune() {
    guard let newest = timestamp(samples.last) else { return }
    let oldest = newest - windowMs
    if let firstKeep = samples.firstIndex(where: { (timestamp($0) ?? 0) >= oldest }), firstKeep > 0 {
      samples.removeFirst(firstKeep)
    }
  }

  private func scheduleTick() {
    guard active else { return }
    tickSeq &+= 1
    let expected = tickSeq
    let work = DispatchWorkItem { [weak self] in
      guard let self, self.active, self.tickSeq == expected else { return }
      self.emitSeries()
      self.scheduleTick()
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + Double(Self.intervalMs) / 1000.0, execute: work)
  }

  private func emitSeries() {
    guard !samples.isEmpty else { return }
    var metrics: [String: Any?] = [:]
    for metric in Self.metrics {
      let series = LiveSeriesDownsampler.downsampleMinMax(
        samples,
        bucketCount: Self.buckets,
        windowMs: windowMs,
        timestamp: { self.timestamp($0) ?? 0 },
        value: metric.select
      )
      if !series.isEmpty { metrics[metric.key] = series }
    }
    guard !metrics.isEmpty else { return }
    emit?("onLiveSeries", ["metrics": metrics, "generation": generation()])
  }

  private func timestamp(_ sample: [String: Any?]?) -> Int64? {
    guard let sample else { return nil }
    return Self.num(sample, "lastPacketAt").map { Int64($0) }
  }

  // MARK: - Metric selectors (mirrors Android `LIVE_SERIES_METRICS`)

  private struct Metric {
    let key: String
    let select: ([String: Any?]) -> Double?
  }

  private static let metrics: [Metric] = [
    Metric(key: "motorTemp") { num($0, "tempMotor").flatMap { $0 > 0 ? $0 : nil } },
    Metric(key: "controllerTemp") { num($0, "tempMosfet") },
    Metric(key: "motorCurrent") { num($0, "motorCurrent") },
    Metric(key: "batteryCurrent") { num($0, "batteryCurrent") },
    Metric(key: "batteryVoltage") { num($0, "batteryVoltage") },
    Metric(key: "batteryPercent") { num($0, "batteryPercent") },
    Metric(key: "speed") { num($0, "speed").map { abs($0) } },
    Metric(key: "duty") { num($0, "dutyCycle").map { abs($0) * 100 } },
    // Detail-chart-only metrics (no center sparkline) so `/control` reads the cheap series too.
    Metric(key: "pitch") { num($0, "pitch") },
    Metric(key: "roll") { num($0, "roll") },
    Metric(key: "balancePitch") { num($0, "balancePitch") },
    Metric(key: "footpadAdc1") { num($0, "adc1") },
    Metric(key: "footpadAdc2") { num($0, "adc2") },
  ]

  private static func num(_ map: [String: Any?], _ key: String) -> Double? {
    guard let raw = map[key] ?? nil else { return nil }
    if let d = raw as? Double { return d }
    if let i = raw as? Int { return Double(i) }
    if let i = raw as? Int64 { return Double(i) }
    if let n = raw as? NSNumber { return n.doubleValue }
    return nil
  }
}
