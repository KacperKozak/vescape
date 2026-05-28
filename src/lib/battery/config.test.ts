import { expect, test } from 'bun:test'

import { deriveBatteryConfig } from './config'
import { DEFAULT_BATTERY_CONFIG } from './data'

test('derives preset pack voltages and nominal watt-hours', () => {
  const derived = deriveBatteryConfig(DEFAULT_BATTERY_CONFIG)

  expect(derived.warning).toBeNull()
  expect(derived.minVoltage).toBe(60)
  expect(derived.maxVoltage).toBe(84)
  expect(derived.nominalVoltage).toBe(72)
  expect(derived.nominalWh).toBe(720)
})

test('manual config uses generic min max curve', () => {
  const config = { mode: 'manual' as const, minVoltage: 60, maxVoltage: 84 }

  expect(deriveBatteryConfig(config).warning).toBeNull()
})

test('missing and unknown preset configs return unconfigured state', () => {
  expect(deriveBatteryConfig(null).warning).toBe('missing')
  expect(
    deriveBatteryConfig({
      mode: 'preset',
      cellPresetId: 'missing',
      seriesCount: 20,
      parallelCount: 2,
    }).warning,
  ).toBe('unknown-preset')
})

test('invalid manual config returns invalid warning', () => {
  expect(deriveBatteryConfig({ mode: 'manual', minVoltage: 84, maxVoltage: 60 }).warning).toBe(
    'invalid',
  )
})
