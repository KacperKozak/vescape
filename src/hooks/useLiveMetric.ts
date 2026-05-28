import { useMemo } from 'react'
import type { TelemetryEvent } from 'vesc-ble'

import { useBleStore } from '@/store/bleStore'
import type { ExcludedRange } from '@/components/ui/charts/chartMath'
import { finite, absolute } from '@/helpers/finite'
import { liveTelemetryRuntime } from '@/lib/telemetry/liveTelemetryRuntime'

export interface LiveMetricPoint {
  ts: number
  value: number
}

type TelemetrySelector = (sample: TelemetryEvent) => number | null | undefined

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
  speed: (s: TelemetryEvent) => (s.metricExclusions?.max_speed ? null : absolute(s.speed)),
  duty: (s: TelemetryEvent) => {
    if (s.metricExclusions?.max_duty) return null
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

function buildLiveExcludedRanges(
  telemetry: TelemetryEvent[],
  metricKeys: string[],
  mergeGapMs = 2000,
): ExcludedRange[] {
  const metricKeySet = new Set(metricKeys)
  const hasSpeedOnly = metricKeySet.has('avg_speed') && metricKeySet.size === 1
  const reason = hasSpeedOnly ? 'low_speed' : 'free_spin'
  const ranges: ExcludedRange[] = []
  for (const s of telemetry) {
    if (!metricKeys.some((k) => s.metricExclusions?.[k])) continue
    const last = ranges.at(-1)
    if (last && last.reason === reason && s.lastPacketAt - last.endMs <= mergeGapMs) {
      last.endMs = s.lastPacketAt
    } else {
      ranges.push({ startMs: s.lastPacketAt, endMs: s.lastPacketAt, reason })
    }
  }
  return ranges
}

export function useLiveExcludedRanges(...metricKeys: string[]): ExcludedRange[] {
  const version = useBleStore((s) => s.metricVersion)
  const keysKey = metricKeys.join('\0')
  return useMemo(() => {
    const telemetry = liveTelemetryRuntime.getTelemetry()
    return buildLiveExcludedRanges(telemetry, keysKey.split('\0'))
  }, [version, keysKey])
}
