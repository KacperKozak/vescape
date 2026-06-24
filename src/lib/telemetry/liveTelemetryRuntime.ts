import { makeMutable, type SharedValue } from 'react-native-reanimated'
import { scheduleOnUI } from 'react-native-worklets'
import type { LiveStateEvent, LocationEvent, TelemetryEvent } from 'vesc-ble'

import {
  appendLocationSample,
  appendTelemetrySample,
  clearLiveMetricBuffer,
  clearLiveTelemetryBuffer,
  createLiveMetricBuffer,
  getLatestApproximateGps,
  getLatestTelemetry,
  summarizeLiveStatus,
  type LiveStatusSummary,
} from './liveMetricHistory'
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
  adc1: SharedValue<number | null>
  adc2: SharedValue<number | null>
  lastPacketAt: SharedValue<number | null>
  avgLatencyMs: SharedValue<number | null>
}

/** Plain scalar bundle shipped to the UI thread in one hop, instead of 13 separate SharedValue writes. */
type TickScalars = Record<keyof LiveTelemetryValues, number | null>

const EMPTY_TICK: TickScalars = {
  speedKmh: null,
  dutyPercent: null,
  motorCurrent: null,
  batteryCurrent: null,
  batteryVoltage: null,
  batteryPercent: null,
  motorTemp: null,
  controllerTemp: null,
  pitch: null,
  adc1: null,
  adc2: null,
  lastPacketAt: null,
  avgLatencyMs: null,
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
  /** Hot path: per-frame scalar tick. Updates live SharedValues only — no buffer, no snapshot. */
  ingestTick: (tick: TelemetryEvent) => void
  /** Cold path: batched full samples into the history buffer. Returns last accepted lastPacketAt, or null. */
  ingestHistoryBatch: (samples: TelemetryEvent[]) => number | null
  ingestLocation: (location: LocationEvent) => void
  /** Clears board-derived readouts while retaining phone GPS live state. */
  clearBoardTelemetry: () => LiveTelemetrySnapshot
  reset: () => LiveTelemetrySnapshot
  getSnapshot: () => LiveTelemetrySnapshot
  consumePendingSnapshot: () => LiveTelemetrySnapshot | null
  getVersion: () => number
  getTelemetry: () => TelemetryEvent[]
  getLocations: () => LocationEvent[]
}

interface LiveTelemetryRuntimeOptions {
  windowMs: () => number
}

function dutyPercent(value: number | null | undefined): number | null {
  const finiteValue = absolute(value)
  return finiteValue == null ? null : finiteValue * 100
}

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
    adc1: makeMutable<number | null>(null),
    adc2: makeMutable<number | null>(null),
    lastPacketAt: makeMutable<number | null>(null),
    avgLatencyMs: makeMutable<number | null>(null),
  }
}

/** Pure JS projection of a telemetry frame into the scalar bundle. No SharedValue writes. */
function tickScalars(telemetry: TelemetryEvent): TickScalars {
  return {
    speedKmh: absolute(telemetry.speed),
    dutyPercent: dutyPercent(telemetry.dutyCycle),
    motorCurrent: finite(telemetry.motorCurrent),
    batteryCurrent: finite(telemetry.batteryCurrent),
    batteryVoltage: finite(telemetry.batteryVoltage),
    batteryPercent: finite(telemetry.batteryPercent),
    motorTemp: telemetry.tempMotor != null && telemetry.tempMotor > 0 ? telemetry.tempMotor : null,
    controllerTemp: finite(telemetry.tempMosfet),
    pitch: finite(telemetry.pitch),
    adc1: finite(telemetry.adc1),
    adc2: finite(telemetry.adc2),
    lastPacketAt: finite(telemetry.lastPacketAt),
    avgLatencyMs: finite(telemetry.avgLatency),
  }
}

export function createLiveTelemetryRuntime({
  windowMs,
}: LiveTelemetryRuntimeOptions): LiveTelemetryRuntime {
  const buffer = createLiveMetricBuffer()
  const values = createValues()

  // One UI-thread worklet assigns all 13 SharedValues. Only the scalar bundle crosses the
  // JS→UI boundary (a single serialization per frame) instead of 13 separate `.value=` hops
  // on the JS thread, which were the dominant live-telemetry cost (createSerializable + GC).
  function applyTick(next: TickScalars): void {
    'worklet'
    values.speedKmh.value = next.speedKmh
    values.dutyPercent.value = next.dutyPercent
    values.motorCurrent.value = next.motorCurrent
    values.batteryCurrent.value = next.batteryCurrent
    values.batteryVoltage.value = next.batteryVoltage
    values.batteryPercent.value = next.batteryPercent
    values.motorTemp.value = next.motorTemp
    values.controllerTemp.value = next.controllerTemp
    values.pitch.value = next.pitch
    values.adc1.value = next.adc1
    values.adc2.value = next.adc2
    values.lastPacketAt.value = next.lastPacketAt
    values.avgLatencyMs.value = next.avgLatencyMs
  }

  function pushTick(next: TickScalars): void {
    scheduleOnUI(applyTick, next)
  }

  let connectionSeq = 0
  let pendingSnapshot = false
  let version = 0
  let snapshot: LiveTelemetrySnapshot = {
    liveLocationHistory: [],
    latestApproximateLocation: null,
    liveStatus: summarizeLiveStatus(buffer),
  }

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
      pushTick(latestTelemetry ? tickScalars(latestTelemetry) : EMPTY_TICK)

      return publishSnapshot()
    },

    ingestTick(tick) {
      if (tick.generation != null && tick.generation !== connectionSeq) return
      pushTick(tickScalars(tick))
    },

    ingestHistoryBatch(samples) {
      let lastAccepted: number | null = null
      for (const sample of samples) {
        if (sample.generation != null && sample.generation !== connectionSeq) continue
        appendTelemetryAndLocation(sample)
        lastAccepted = sample.lastPacketAt
      }
      if (lastAccepted == null) return null
      markPending()
      return lastAccepted
    },

    ingestLocation(location) {
      appendLocationSample(buffer, location, windowMs())
      markPending()
    },

    clearBoardTelemetry() {
      clearLiveTelemetryBuffer(buffer)
      pushTick(EMPTY_TICK)
      pendingSnapshot = false
      return publishSnapshot()
    },

    reset() {
      clearLiveMetricBuffer(buffer)
      pushTick(EMPTY_TICK)
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
