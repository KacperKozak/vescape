import { makeMutable, type SharedValue } from 'react-native-reanimated'
import type { LiveStateEvent, LocationEvent, TelemetryEvent } from 'vesc-ble'

import {
  appendLocationSample,
  appendTelemetrySample,
  clearLiveMetricBuffer,
  createLiveMetricBuffer,
  getLatestApproximateGps,
  getLatestTelemetry,
  summarizeLiveStatus,
  type LiveStatusSummary,
} from './liveMetricHistory'
import { createBuckets, pushBucketSample, type SparklineBuckets } from './sparklineBuckets'
import { finite, absolute } from '@/helpers/finite'
import { getLiveWindowMs } from '@/store/settingsStore'

interface LiveTelemetryValues {
  speedKmh: SharedValue<number | null>
  dutyPercent: SharedValue<number | null>
  motorCurrent: SharedValue<number | null>
  batteryCurrent: SharedValue<number | null>
  batteryVoltage: SharedValue<number | null>
  batteryPercent: SharedValue<number | null>
  motorTemp: SharedValue<number | null>
  controllerTemp: SharedValue<number | null>
  pitch: SharedValue<number | null>
  lastPacketAt: SharedValue<number | null>
  avgLatencyMs: SharedValue<number | null>
}

interface LiveTelemetrySnapshot {
  liveLocationHistory: LocationEvent[]
  latestApproximateLocation: LocationEvent | null
  liveStatus: LiveStatusSummary
}

export interface LiveTelemetryRuntime {
  values: LiveTelemetryValues
  syncConnectionSeq: (connectionSeq: number) => void
  seedFromLiveState: (state: LiveStateEvent) => LiveTelemetrySnapshot
  ingestTelemetry: (telemetry: TelemetryEvent) => boolean
  ingestLocation: (location: LocationEvent) => void
  reset: () => LiveTelemetrySnapshot
  getSnapshot: () => LiveTelemetrySnapshot
  consumePendingSnapshot: () => LiveTelemetrySnapshot | null
  getVersion: () => number
  getTelemetry: () => TelemetryEvent[]
  getLocations: () => LocationEvent[]
  getBuckets: (key: ChartedMetricKey) => SparklineBuckets
}

interface LiveTelemetryRuntimeOptions {
  windowMs: () => number
}

function dutyPercent(value: number | null | undefined): number | null {
  const finiteValue = absolute(value)
  return finiteValue == null ? null : finiteValue * 100
}

/**
 * Metrics drawn as live sparklines. The runtime keeps a small, fixed-count set
 * of display buckets per metric (updated O(1) per sample) so charts never
 * re-project the full raw history on publish. Top gauge lines get more buckets
 * for detail; compact strip slots get fewer for a calmer trace.
 */
const TOP_BUCKET_COUNT = 64
const STRIP_BUCKET_COUNT = 32

export type ChartedMetricKey =
  | 'speedKmh'
  | 'dutyPercent'
  | 'motorTemp'
  | 'controllerTemp'
  | 'motorCurrent'
  | 'batteryCurrent'
  | 'batteryVoltage'

const CHARTED_METRICS: Record<
  ChartedMetricKey,
  { count: number; pick: (telemetry: TelemetryEvent) => number | null }
> = {
  speedKmh: { count: TOP_BUCKET_COUNT, pick: (t) => absolute(t.speed) },
  dutyPercent: { count: TOP_BUCKET_COUNT, pick: (t) => dutyPercent(t.dutyCycle) },
  motorTemp: {
    count: STRIP_BUCKET_COUNT,
    pick: (t) => (t.tempMotor != null && t.tempMotor > 0 ? t.tempMotor : null),
  },
  controllerTemp: { count: STRIP_BUCKET_COUNT, pick: (t) => finite(t.tempMosfet) },
  motorCurrent: { count: STRIP_BUCKET_COUNT, pick: (t) => finite(t.motorCurrent) },
  batteryCurrent: { count: STRIP_BUCKET_COUNT, pick: (t) => finite(t.batteryCurrent) },
  batteryVoltage: { count: STRIP_BUCKET_COUNT, pick: (t) => finite(t.batteryVoltage) },
}

const CHARTED_KEYS = Object.keys(CHARTED_METRICS) as ChartedMetricKey[]

function createValues(): LiveTelemetryValues {
  return {
    speedKmh: makeMutable<number | null>(null),
    dutyPercent: makeMutable<number | null>(null),
    motorCurrent: makeMutable<number | null>(null),
    batteryCurrent: makeMutable<number | null>(null),
    batteryVoltage: makeMutable<number | null>(null),
    batteryPercent: makeMutable<number | null>(null),
    motorTemp: makeMutable<number | null>(null),
    controllerTemp: makeMutable<number | null>(null),
    pitch: makeMutable<number | null>(null),
    lastPacketAt: makeMutable<number | null>(null),
    avgLatencyMs: makeMutable<number | null>(null),
  }
}

function clearValues(values: LiveTelemetryValues): void {
  values.speedKmh.value = null
  values.dutyPercent.value = null
  values.motorCurrent.value = null
  values.batteryCurrent.value = null
  values.batteryVoltage.value = null
  values.batteryPercent.value = null
  values.motorTemp.value = null
  values.controllerTemp.value = null
  values.pitch.value = null
  values.lastPacketAt.value = null
  values.avgLatencyMs.value = null
}

function updateValuesFromTelemetry(values: LiveTelemetryValues, telemetry: TelemetryEvent): void {
  values.speedKmh.value = absolute(telemetry.speed)
  values.dutyPercent.value = dutyPercent(telemetry.dutyCycle)
  values.motorCurrent.value = finite(telemetry.motorCurrent)
  values.batteryCurrent.value = finite(telemetry.batteryCurrent)
  values.batteryVoltage.value = finite(telemetry.batteryVoltage)
  values.batteryPercent.value = finite(telemetry.batteryPercent)
  values.motorTemp.value =
    telemetry.tempMotor != null && telemetry.tempMotor > 0 ? telemetry.tempMotor : null
  values.controllerTemp.value = finite(telemetry.tempMosfet)
  values.pitch.value = finite(telemetry.pitch)
  values.lastPacketAt.value = finite(telemetry.lastPacketAt)
  values.avgLatencyMs.value = finite(telemetry.avgLatency)
}

export function createLiveTelemetryRuntime({
  windowMs,
}: LiveTelemetryRuntimeOptions): LiveTelemetryRuntime {
  const buffer = createLiveMetricBuffer()
  const values = createValues()
  let connectionSeq = 0
  let pendingSnapshot = false
  let version = 0
  let snapshot: LiveTelemetrySnapshot = {
    liveLocationHistory: [],
    latestApproximateLocation: null,
    liveStatus: summarizeLiveStatus(buffer),
  }

  const bucketStates = {} as Record<ChartedMetricKey, SparklineBuckets>
  let bucketWindowMs = windowMs()

  function pushSampleToBuckets(telemetry: TelemetryEvent): void {
    for (const key of CHARTED_KEYS) {
      const value = CHARTED_METRICS[key].pick(telemetry)
      if (value == null) continue
      pushBucketSample(bucketStates[key], telemetry.lastPacketAt, value)
    }
  }

  /** Recreate every metric's buckets and replay the current raw buffer. */
  function rebuildBuckets(): void {
    bucketWindowMs = windowMs()
    const now = getLatestTelemetry(buffer)?.lastPacketAt ?? Date.now()
    for (const key of CHARTED_KEYS) {
      bucketStates[key] = createBuckets(CHARTED_METRICS[key].count, bucketWindowMs, now)
    }
    for (const sample of buffer.telemetry) pushSampleToBuckets(sample)
  }

  rebuildBuckets()

  function publishSnapshot(): LiveTelemetrySnapshot {
    version += 1
    snapshot = {
      liveLocationHistory: [...buffer.locations],
      latestApproximateLocation: getLatestApproximateGps(buffer),
      liveStatus: summarizeLiveStatus(buffer),
    }
    return snapshot
  }

  function appendTelemetryAndLocation(telemetry: TelemetryEvent): void {
    appendTelemetrySample(buffer, telemetry, windowMs())
    if (telemetry.location) {
      appendLocationSample(buffer, telemetry.location, windowMs())
    }
  }

  function markPending(): void {
    pendingSnapshot = true
  }

  function consumePendingSnapshot(): LiveTelemetrySnapshot | null {
    if (!pendingSnapshot) return null
    pendingSnapshot = false
    return publishSnapshot()
  }

  return {
    values,

    getVersion() {
      return version
    },

    getTelemetry() {
      return buffer.telemetry
    },

    getLocations() {
      return buffer.locations
    },

    getBuckets(key) {
      return bucketStates[key]
    },

    syncConnectionSeq(nextConnectionSeq) {
      connectionSeq = nextConnectionSeq
    },

    seedFromLiveState(state) {
      connectionSeq = state.board.connectionSeq
      clearLiveMetricBuffer(buffer)

      for (const telemetry of state.board.recentTelemetry) {
        appendTelemetryAndLocation(telemetry)
      }
      const approximateFix = state.gps.latestApproximateFix ?? state.gps.latestFix
      if (approximateFix) {
        appendLocationSample(buffer, approximateFix, windowMs())
      }
      for (const location of state.gps.recentLocations) {
        appendLocationSample(buffer, location, windowMs())
      }

      const latestTelemetry = getLatestTelemetry(buffer)
      if (latestTelemetry) updateValuesFromTelemetry(values, latestTelemetry)
      else clearValues(values)
      rebuildBuckets()

      return publishSnapshot()
    },

    ingestTelemetry(telemetry) {
      if (telemetry.generation != null && telemetry.generation !== connectionSeq) {
        return false
      }

      appendTelemetryAndLocation(telemetry)
      if (windowMs() !== bucketWindowMs) rebuildBuckets()
      else pushSampleToBuckets(telemetry)
      const latestTelemetry = getLatestTelemetry(buffer)
      if (latestTelemetry) updateValuesFromTelemetry(values, latestTelemetry)
      else clearValues(values)
      markPending()
      return true
    },

    ingestLocation(location) {
      appendLocationSample(buffer, location, windowMs())
      markPending()
    },

    reset() {
      clearLiveMetricBuffer(buffer)
      clearValues(values)
      rebuildBuckets()
      pendingSnapshot = false
      return publishSnapshot()
    },

    getSnapshot() {
      return snapshot
    },

    consumePendingSnapshot,
  }
}

export const liveTelemetryRuntime = createLiveTelemetryRuntime({ windowMs: getLiveWindowMs })
