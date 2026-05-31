import { expect, test, describe } from 'bun:test'

import { BATTERY_CELL_PRESETS, DEFAULT_BATTERY_CONFIG, getBatteryPreset } from './data'
import cellPresetsJson from '../../../shared/data/cell-presets.json'

describe('BATTERY_CELL_PRESETS', () => {
  test('has at least one preset', () => {
    expect(BATTERY_CELL_PRESETS.length).toBeGreaterThan(0)
  })

  test('all presets have unique IDs', () => {
    const ids = BATTERY_CELL_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('all presets have valid voltages', () => {
    for (const preset of BATTERY_CELL_PRESETS) {
      expect(preset.nominalVoltage).toBeGreaterThan(0)
      expect(preset.fullVoltage).toBeGreaterThan(0)
      expect(preset.recommendedEmptyVoltage).toBeGreaterThan(0)
      expect(preset.fullVoltage).toBeGreaterThan(preset.recommendedEmptyVoltage)
      expect(preset.nominalVoltage).toBeGreaterThanOrEqual(preset.recommendedEmptyVoltage)
      expect(preset.fullVoltage).toBeGreaterThanOrEqual(preset.nominalVoltage)
    }
  })

  test('all presets have non-empty required fields', () => {
    for (const preset of BATTERY_CELL_PRESETS) {
      expect(preset.id).toBeTruthy()
      expect(preset.formFactor).toBeTruthy()
      expect(preset.brand).toBeTruthy()
      expect(preset.model).toBeTruthy()
      expect(preset.chemistry).toBeTruthy()
      expect(preset.capacityAh).toBeGreaterThan(0)
    }
  })

  test('all curveIds reference existing curves', () => {
    const curveIds = new Set(Object.keys(cellPresetsJson.curves))
    for (const preset of BATTERY_CELL_PRESETS) {
      expect(curveIds.has(preset.curveId)).toBe(true)
    }
  })

  test('every curve is valid: monotonic, SOC 100→0', () => {
    for (const [name, curve] of Object.entries(cellPresetsJson.curves)) {
      expect(curve.length, `curve "${name}": need >=2 points`).toBeGreaterThanOrEqual(2)
      expect(curve[0].soc, `curve "${name}": first SOC must be 100`).toBe(100)
      expect(curve[curve.length - 1].soc, `curve "${name}": last SOC must be 0`).toBe(0)
      for (let i = 1; i < curve.length; i++) {
        expect(
          curve[i].voltage,
          `curve "${name}"[${i}]: voltage ${curve[i].voltage}V >= ${curve[i - 1].voltage}V`,
        ).toBeLessThan(curve[i - 1].voltage)
        expect(
          curve[i].soc,
          `curve "${name}"[${i}]: SOC ${curve[i].soc}% >= ${curve[i - 1].soc}%`,
        ).toBeLessThan(curve[i - 1].soc)
      }
    }
  })
})

describe('DEFAULT_BATTERY_CONFIG', () => {
  test('cellPresetId matches an existing preset', () => {
    expect(getBatteryPreset(DEFAULT_BATTERY_CONFIG.cellPresetId)).not.toBeNull()
  })

  test('series and parallel counts are positive', () => {
    expect(DEFAULT_BATTERY_CONFIG.seriesCount).toBeGreaterThan(0)
    expect(DEFAULT_BATTERY_CONFIG.parallelCount).toBeGreaterThan(0)
  })
})

describe('getBatteryPreset', () => {
  test('returns null for unknown id', () => {
    expect(getBatteryPreset('nonexistent')).toBeNull()
  })

  test('returns preset for known id', () => {
    const preset = getBatteryPreset('molicel:21700:p50b')
    expect(preset).not.toBeNull()
    expect(preset?.model).toBe('P50B')
  })
})
