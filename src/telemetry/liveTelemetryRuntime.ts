import { makeMutable, type SharedValue } from 'react-native-reanimated'
import type { LiveStateEvent, LocationEvent, TelemetryEvent } from 'vesc-ble'

import {
  appendLocationSample,
  appendTelemetrySample,
  clearLiveMetricBuffer,
  createLiveMetricBuffer,
  emptyLiveMetricHistory,
  getLatestTelemetry,
  projectLiveMetricHistory,
  summarizeLiveStatus,
  type LiveMetricHistory,
  type LiveStatusSummary,
} from './liveMetricHistory'
import { useSettingsStore } from '@/store/settingsStore'

export interface LiveTelemetryValues {
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

export interface LiveTelemetrySnapshot {
  liveMetricHistory: LiveMetricHistory
  liveLocationHistory: LocationEvent[]
  liveStatus: LiveStatusSummary
}

export interface LiveTelemetryRuntime {
  values: LiveTelemetryValues
  seedFromLiveState: (state: LiveStateEvent) => LiveTelemetrySnapshot
  ingestTelemetry: (telemetry: TelemetryEvent) => LiveTelemetrySnapshot | null
  ingestLocation: (location: LocationEvent) => LiveTelemetrySnapshot
  reset: () => LiveTelemetrySnapshot
  getSnapshot: () => LiveTelemetrySnapshot
}

interface LiveTelemetryRuntimeOptions {
  windowMs: () => number
}

const MIN_LIVE_HISTORY_MINUTES = 1
const DEFAULT_LIVE_HISTORY_MINUTES = 5

function liveHistoryWindowMs(): number {
  const minutes = useSettingsStore.getState().liveHistoryLimit
  const safeMinutes =
    Number.isFinite(minutes) && minutes >= MIN_LIVE_HISTORY_MINUTES
      ? minutes
      : DEFAULT_LIVE_HISTORY_MINUTES
  return safeMinutes * 60 * 1000
}

function finite(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : value
}

function absolute(value: number | null | undefined): number | null {
  const finiteValue = finite(value)
  return finiteValue == null ? null : Math.abs(finiteValue)
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
  let snapshot: LiveTelemetrySnapshot = {
    liveMetricHistory: emptyLiveMetricHistory(),
    liveLocationHistory: [],
    liveStatus: summarizeLiveStatus(buffer),
  }

  function publishSnapshot(): LiveTelemetrySnapshot {
    snapshot = {
      liveMetricHistory: projectLiveMetricHistory(buffer),
      liveLocationHistory: [...buffer.locations],
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

  return {
    values,

    seedFromLiveState(state) {
      connectionSeq = state.board.connectionSeq
      clearLiveMetricBuffer(buffer)

      for (const telemetry of state.board.recentTelemetry) {
        appendTelemetryAndLocation(telemetry)
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
        return null
      }

      appendTelemetryAndLocation(telemetry)
      const latestTelemetry = getLatestTelemetry(buffer)
      if (latestTelemetry) updateValuesFromTelemetry(values, latestTelemetry)
      else clearValues(values)
      return publishSnapshot()
    },

    ingestLocation(location) {
      appendLocationSample(buffer, location, windowMs())
      return publishSnapshot()
    },

    reset() {
      clearLiveMetricBuffer(buffer)
      clearValues(values)
      return publishSnapshot()
    },

    getSnapshot() {
      return snapshot
    },
  }
}

export const liveTelemetryRuntime = createLiveTelemetryRuntime({ windowMs: liveHistoryWindowMs })
