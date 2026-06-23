import type { LocationEvent, TelemetryEvent } from 'vesc-ble'

export interface LiveStatusSummary {
  boardSampleCount: number
  boardLastPacketAt: number | null
  boardAvgLatencyMs: number | null
  gpsSampleCount: number
  gpsLastFixAt: number | null
  gpsPrecise: boolean
  gpsAccuracyM: number | null
}

export interface LiveMetricBuffer {
  telemetry: TelemetryEvent[]
  locations: LocationEvent[]
  latestApproximateLocation: LocationEvent | null
}

export function createLiveMetricBuffer(): LiveMetricBuffer {
  return { telemetry: [], locations: [], latestApproximateLocation: null }
}

export function clearLiveMetricBuffer(buffer: LiveMetricBuffer): void {
  buffer.telemetry.length = 0
  buffer.locations.length = 0
  buffer.latestApproximateLocation = null
}

function pruneByTime<T>(
  items: T[],
  nowMs: number,
  windowMs: number,
  key: (item: T) => number,
): void {
  const oldest = nowMs - windowMs
  let firstKept = 0
  while (firstKept < items.length && key(items[firstKept]) < oldest) firstKept += 1
  if (firstKept > 0) items.splice(0, firstKept)
}

function insertByTime<T>(items: T[], item: T, key: (item: T) => number): void {
  const itemKey = key(item)
  // Fast path: monotonic append. Live feeds and the connect backfill both
  // arrive in ascending time, so this is the common case and stays O(1) —
  // avoiding the O(N) dedup scan + findIndex that made backfill O(N²).
  const lastKey = items.length > 0 ? key(items[items.length - 1]) : null
  if (lastKey == null || itemKey > lastKey) {
    items.push(item)
    return
  }
  if (itemKey === lastKey) return // duplicate of newest sample

  // Out-of-order arrival: walk back from the end to find the slot, deduping
  // along the way (equal keys are contiguous in a time-sorted array).
  let insertAt = 0
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const k = key(items[i])
    if (k === itemKey) return // duplicate
    if (k < itemKey) {
      insertAt = i + 1
      break
    }
  }
  items.splice(insertAt, 0, item)
}

export function appendTelemetrySample(
  buffer: LiveMetricBuffer,
  telemetry: TelemetryEvent,
  windowMs: number,
): void {
  applyMetricExclusionUpdates(buffer, telemetry)
  insertByTime(buffer.telemetry, telemetry, (sample) => sample.lastPacketAt)
  const latestTelemetry = getLatestTelemetry(buffer)
  if (latestTelemetry) {
    pruneByTime(
      buffer.telemetry,
      latestTelemetry.lastPacketAt,
      windowMs,
      (sample) => sample.lastPacketAt,
    )
  }
}

function applyMetricExclusionUpdates(buffer: LiveMetricBuffer, telemetry: TelemetryEvent): void {
  const updates = telemetry.metricExclusionUpdates
  if (!updates || updates.length === 0) return

  for (const update of updates) {
    const sample = buffer.telemetry.find((item) => item.lastPacketAt === update.lastPacketAt)
    if (sample) sample.metricExclusions = update.metricExclusions
    if (telemetry.lastPacketAt === update.lastPacketAt) {
      telemetry.metricExclusions = update.metricExclusions
    }
  }
}

export function appendLocationSample(
  buffer: LiveMetricBuffer,
  location: LocationEvent,
  windowMs: number,
): void {
  if (
    buffer.latestApproximateLocation == null ||
    location.timestamp > buffer.latestApproximateLocation.timestamp
  ) {
    buffer.latestApproximateLocation = location
  }
  if (!location.precise) return

  insertByTime(buffer.locations, location, (sample) => sample.timestamp)
  const latestGps = getLatestGps(buffer)
  if (latestGps) {
    pruneByTime(buffer.locations, latestGps.timestamp, windowMs, (sample) => sample.timestamp)
  }
}

export function summarizeLiveStatus(buffer: LiveMetricBuffer): LiveStatusSummary {
  const latestTelemetry = getLatestTelemetry(buffer)
  const latestGps = buffer.latestApproximateLocation ?? getLatestGps(buffer)
  return {
    boardSampleCount: buffer.telemetry.length,
    boardLastPacketAt: latestTelemetry?.lastPacketAt ?? null,
    boardAvgLatencyMs: latestTelemetry?.avgLatency ?? null,
    gpsSampleCount: buffer.locations.length,
    gpsLastFixAt: latestGps?.timestamp ?? null,
    gpsPrecise: latestGps?.precise ?? false,
    gpsAccuracyM: latestGps?.accuracyM ?? null,
  }
}

export function getLatestTelemetry(buffer: LiveMetricBuffer): TelemetryEvent | null {
  return buffer.telemetry.at(-1) ?? null
}

export function getLatestGps(buffer: LiveMetricBuffer): LocationEvent | null {
  return buffer.locations.at(-1) ?? null
}

export function getLatestApproximateGps(buffer: LiveMetricBuffer): LocationEvent | null {
  return buffer.latestApproximateLocation
}
