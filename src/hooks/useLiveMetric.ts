import { useMemo } from 'react'
import type { TelemetryEvent } from 'vesc-ble'

import { useBleStore } from '@/store/bleStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

export interface LiveMetricPoint {
  ts: number
  value: number
}

type TelemetrySelector = (sample: TelemetryEvent) => number | null | undefined

function finite(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : value
}

function absolute(value: number | null | undefined): number | null {
  const v = finite(value)
  return v == null ? null : Math.abs(v)
}

function projectMetric(telemetry: TelemetryEvent[], pick: TelemetrySelector): LiveMetricPoint[] {
  const points: LiveMetricPoint[] = []
  for (const sample of telemetry) {
    const value = pick(sample)
    if (value == null || !Number.isFinite(value)) continue
    points.push({ ts: sample.lastPacketAt, value })
  }
  return points
}

export const liveSelectors = {
  speed: (s: TelemetryEvent) => absolute(s.speed),
  duty: (s: TelemetryEvent) => {
    const v = absolute(s.dutyCycle)
    return v == null ? null : v * 100
  },
  motorCurrent: (s: TelemetryEvent) => finite(s.motorCurrent),
  batteryCurrent: (s: TelemetryEvent) => finite(s.batteryCurrent),
  batteryVoltage: (s: TelemetryEvent) => finite(s.batteryVoltage),
  motorTemp: (s: TelemetryEvent) => (s.tempMotor != null && s.tempMotor > 0 ? s.tempMotor : null),
  controllerTemp: (s: TelemetryEvent) => finite(s.tempMosfet),
  footpadAdc1: (s: TelemetryEvent) => finite(s.adc1),
  footpadAdc2: (s: TelemetryEvent) => finite(s.adc2),
  pitch: (s: TelemetryEvent) => finite(s.pitch),
  roll: (s: TelemetryEvent) => finite(s.roll),
  balancePitch: (s: TelemetryEvent) => finite(s.balancePitch),
} as const

const EMPTY: LiveMetricPoint[] = []

let cachedVersion = -1
const cache = new Map<TelemetrySelector, LiveMetricPoint[]>()

function getOrProject(version: number, pick: TelemetrySelector): LiveMetricPoint[] {
  if (version !== cachedVersion) {
    cache.clear()
    cachedVersion = version
  }
  let result = cache.get(pick)
  if (!result) {
    const telemetry = liveTelemetryRuntime.getTelemetry()
    if (telemetry.length === 0) return EMPTY
    result = projectMetric(telemetry, pick)
    cache.set(pick, result)
  }
  return result
}

export function useLiveMetric(pick: TelemetrySelector): LiveMetricPoint[] {
  const version = useBleStore((s) => s.metricVersion)
  return useMemo(() => getOrProject(version, pick), [version, pick])
}
