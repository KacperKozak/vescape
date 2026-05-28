import { expect, test } from 'bun:test'

import { DEFAULT_BATTERY_CONFIG } from './data'
import { estimateBatteryPercent } from './soc'

test('estimates preset state of charge from per-cell curve', () => {
  expect(estimateBatteryPercent(84, DEFAULT_BATTERY_CONFIG)).toBe(100)
  expect(estimateBatteryPercent(60, DEFAULT_BATTERY_CONFIG)).toBe(0)
  expect(estimateBatteryPercent(76, DEFAULT_BATTERY_CONFIG)).toBeCloseTo(60, 5)
})

test('manual config estimates state of charge', () => {
  const config = { mode: 'manual' as const, minVoltage: 60, maxVoltage: 84 }
  expect(estimateBatteryPercent(84, config)).toBe(100)
  expect(estimateBatteryPercent(60, config)).toBe(0)
})

test('returns null for missing or unknown preset configs', () => {
  expect(estimateBatteryPercent(72, null)).toBeNull()
  expect(
    estimateBatteryPercent(72, {
      mode: 'preset',
      cellPresetId: 'missing',
      seriesCount: 20,
      parallelCount: 2,
    }),
  ).toBeNull()
})
