import type { BatteryConfig } from 'vesc-ble'

import type { BatterySocPoint } from './types'
import { deriveBatteryConfig } from './config'

const MANUAL_CURVE: { v: number; soc: number }[] = [
  { v: 1.0, soc: 100 },
  { v: 0.95, soc: 90 },
  { v: 0.9, soc: 75 },
  { v: 0.82, soc: 55 },
  { v: 0.72, soc: 35 },
  { v: 0.55, soc: 18 },
  { v: 0.35, soc: 7 },
  { v: 0.15, soc: 2 },
  { v: 0.0, soc: 0 },
]

function interpolateCurve(voltage: number, curve: BatterySocPoint[]): number {
  const sorted = [...curve].sort((a, b) => b.voltage - a.voltage)
  const first = sorted[0]
  const last = sorted.at(-1)
  if (!first || !last) return 0
  if (voltage >= first.voltage) return 100
  if (voltage <= last.voltage) return 0

  for (let i = 0; i < sorted.length - 1; i++) {
    const hi = sorted[i]
    const lo = sorted[i + 1]
    if (voltage <= hi.voltage && voltage >= lo.voltage) {
      const span = hi.voltage - lo.voltage
      const t = span > 0 ? (voltage - lo.voltage) / span : 0
      return lo.soc + t * (hi.soc - lo.soc)
    }
  }
  return 0
}

function estimateManualBatteryPercent(
  voltage: number,
  minVoltage: number | null,
  maxVoltage: number | null,
): number | null {
  if (minVoltage == null || maxVoltage == null) return null
  if (maxVoltage <= minVoltage) return null

  const norm = (voltage - minVoltage) / (maxVoltage - minVoltage)
  if (norm >= 1) return 100
  if (norm <= 0) return 0

  for (let i = 0; i < MANUAL_CURVE.length - 1; i++) {
    const hi = MANUAL_CURVE[i]
    const lo = MANUAL_CURVE[i + 1]
    if (norm <= hi.v && norm >= lo.v) {
      const span = hi.v - lo.v
      const t = span > 0 ? (norm - lo.v) / span : 0
      return lo.soc + t * (hi.soc - lo.soc)
    }
  }
  return 0
}

export function estimateBatteryPercent(
  voltage: number,
  config: BatteryConfig | null,
): number | null {
  const derived = deriveBatteryConfig(config)
  if (derived.warning != null) return null

  if (config?.mode === 'preset' && derived.preset) {
    return interpolateCurve(voltage / config.seriesCount, derived.preset.socCurve)
  }

  return estimateManualBatteryPercent(voltage, derived.minVoltage, derived.maxVoltage)
}
