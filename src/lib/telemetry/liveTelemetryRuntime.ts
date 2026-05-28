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
import { finite, absolute } from '@/helpers/finite'
import { getLiveWindowMs } from '@/store/settingsStore'

interface LiveTelemetryValues {
  speedKmh: SharedValue<number | null>
  dutyPercent: SharedValue<number | null>
  motorCurrent: SharedValue<number | null>
  batteryCurrent: SharedValue<number | null>
  batteryVoltage: SharedValue<number | null>
  motorTemp: SharedValue<number | null>
  controllerTemp: SharedValue<number | null>
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
    motorTemp: makeMutable<number | null>(null),
    controllerTemp: makeMutable<number | null>(null),
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
  values.motorTemp.value = null
  values.controllerTemp.value = null
  values.lastPacketAt.value = null
  values.avgLatencyMs.value = null
}

function updateValuesFromTelemetry(values: LiveTelemetryValues, telemetry: TelemetryEvent): void {
  values.speedKmh.value = absolute(telemetry.speed)
  values.dutyPercent.value = dutyPercent(telemetry.dutyCycle)
  values.motorCurrent.value = finite(telemetry.motorCurrent)
  values.batteryCurrent.value = finite(telemetry.batteryCurrent)
  values.batteryVoltage.value = finite(telemetry.batteryVoltage)
  values.motorTemp.value =
    telemetry.tempMotor != null && telemetry.tempMotor > 0 ? telemetry.tempMotor : null
  values.controllerTemp.value = finite(telemetry.tempMosfet)
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
      if (latestTelemetry) updateValuesFromTelemetry(values, latestTelemetry)
      else clearValues(values)

      return publishSnapshot()
    },

    ingestTelemetry(telemetry) {
      if (telemetry.generation != null && telemetry.generation !== connectionSeq) {
        return false
      }

      appendTelemetryAndLocation(telemetry)
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
