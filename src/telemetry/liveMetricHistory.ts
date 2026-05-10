import type { LocationEvent, TelemetryEvent } from 'vesc-ble'

export interface LiveMetricPoint {
  ts: number
  value: number
}

export interface LiveMetricHistory {
  speed: LiveMetricPoint[]
  duty: LiveMetricPoint[]
  motorCurrent: LiveMetricPoint[]
  batteryCurrent: LiveMetricPoint[]
  batteryVoltage: LiveMetricPoint[]
  motorTemp: LiveMetricPoint[]
  controllerTemp: LiveMetricPoint[]
  footpadAdc1: LiveMetricPoint[]
  footpadAdc2: LiveMetricPoint[]
  pitch: LiveMetricPoint[]
  roll: LiveMetricPoint[]
  balancePitch: LiveMetricPoint[]
}

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
}

export function createLiveMetricBuffer(): LiveMetricBuffer {
  return { telemetry: [], locations: [] }
}

export function clearLiveMetricBuffer(buffer: LiveMetricBuffer): void {
  buffer.telemetry.length = 0
  buffer.locations.length = 0
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
  if (items.some((existing) => key(existing) === itemKey)) return

  const insertAt = items.findIndex((existing) => key(existing) > itemKey)
  if (insertAt === -1) items.push(item)
  else items.splice(insertAt, 0, item)
}

export function appendTelemetrySample(
  buffer: LiveMetricBuffer,
  telemetry: TelemetryEvent,
  windowMs: number,
): void {
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

export function appendLocationSample(
  buffer: LiveMetricBuffer,
  location: LocationEvent,
  windowMs: number,
): void {
  insertByTime(buffer.locations, location, (sample) => sample.timestamp)
  const latestGps = getLatestGps(buffer)
  if (latestGps) {
    pruneByTime(buffer.locations, latestGps.timestamp, windowMs, (sample) => sample.timestamp)
  }
}

function metric(
  telemetry: TelemetryEvent[],
  pick: (sample: TelemetryEvent) => number | null | undefined,
): LiveMetricPoint[] {
  const points: LiveMetricPoint[] = []
  for (const sample of telemetry) {
    const value = pick(sample)
    if (value == null || !Number.isFinite(value)) continue
    points.push({ ts: sample.lastPacketAt, value })
  }
  return points
}

function finite(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : value
}

function absolute(value: number | null | undefined): number | null {
  const finiteValue = finite(value)
  return finiteValue == null ? null : Math.abs(finiteValue)
}

export function projectLiveMetricHistory(buffer: LiveMetricBuffer): LiveMetricHistory {
  const telemetry = buffer.telemetry
  return {
    speed: metric(telemetry, (sample) => absolute(sample.speed)),
    duty: metric(telemetry, (sample) => {
      const dutyCycle = absolute(sample.dutyCycle)
      return dutyCycle == null ? null : dutyCycle * 100
    }),
    motorCurrent: metric(telemetry, (sample) => finite(sample.motorCurrent)),
    batteryCurrent: metric(telemetry, (sample) => finite(sample.batteryCurrent)),
    batteryVoltage: metric(telemetry, (sample) => finite(sample.batteryVoltage)),
    motorTemp: metric(telemetry, (sample) => finite(sample.tempMotor)),
    controllerTemp: metric(telemetry, (sample) => finite(sample.tempMosfet)),
    footpadAdc1: metric(telemetry, (sample) => finite(sample.adc1)),
    footpadAdc2: metric(telemetry, (sample) => finite(sample.adc2)),
    pitch: metric(telemetry, (sample) => finite(sample.pitch)),
    roll: metric(telemetry, (sample) => finite(sample.roll)),
    balancePitch: metric(telemetry, (sample) => finite(sample.balancePitch)),
  }
}

export function summarizeLiveStatus(buffer: LiveMetricBuffer): LiveStatusSummary {
  const latestTelemetry = getLatestTelemetry(buffer)
  const latestGps = getLatestGps(buffer)
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

export function emptyLiveMetricHistory(): LiveMetricHistory {
  return {
    speed: [],
    duty: [],
    motorCurrent: [],
    batteryCurrent: [],
    batteryVoltage: [],
    motorTemp: [],
    controllerTemp: [],
    footpadAdc1: [],
    footpadAdc2: [],
    pitch: [],
    roll: [],
    balancePitch: [],
  }
}
