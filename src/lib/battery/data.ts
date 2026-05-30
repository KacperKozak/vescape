import type { BatteryPresetConfig } from 'vesc-ble'

import type { BatteryCellPreset } from './types'

export const DEFAULT_BATTERY_CONFIG: BatteryPresetConfig = {
  mode: 'preset',
  cellPresetId: 'molicel:21700:p50b',
  seriesCount: 20,
  parallelCount: 2,
}

export const BATTERY_CELL_PRESETS: BatteryCellPreset[] = [
  {
    id: 'molicel:21700:p45b',
    formFactor: '21700',
    brand: 'Molicel',
    model: 'P45B',
    chemistry: 'NMC',
    nominalVoltage: 3.6,
    fullVoltage: 4.2,
    datasheetEmptyVoltage: 2.5,
    recommendedEmptyVoltage: 3.0,
    capacityAh: 4.5,
    maxContinuousDischargeA: 45,
    verified: true,
  },
  {
    id: 'molicel:21700:p50b',
    formFactor: '21700',
    brand: 'Molicel',
    model: 'P50B',
    chemistry: 'NMC',
    nominalVoltage: 3.6,
    fullVoltage: 4.2,
    datasheetEmptyVoltage: 2.5,
    recommendedEmptyVoltage: 3.0,
    capacityAh: 5.0,
    maxContinuousDischargeA: 60,
    verified: true,
  },
  {
    id: 'molicel:18650:p30b',
    formFactor: '18650',
    brand: 'Molicel',
    model: 'P30B',
    chemistry: 'NMC',
    nominalVoltage: 3.6,
    fullVoltage: 4.2,
    datasheetEmptyVoltage: 2.5,
    recommendedEmptyVoltage: 3.0,
    capacityAh: 3.0,
    maxContinuousDischargeA: 36,
    verified: true,
  },
  {
    id: 'samsung:21700:50s',
    formFactor: '21700',
    brand: 'Samsung',
    model: '50S',
    chemistry: 'NCA',
    nominalVoltage: 3.6,
    fullVoltage: 4.2,
    datasheetEmptyVoltage: 2.5,
    recommendedEmptyVoltage: 3.0,
    capacityAh: 5.0,
    maxContinuousDischargeA: 25,
    verified: true,
  },
  {
    id: 'reliance:21700:rs50',
    formFactor: '21700',
    brand: 'Reliance',
    model: 'RS50',
    chemistry: 'NMC',
    nominalVoltage: 3.6,
    fullVoltage: 4.2,
    datasheetEmptyVoltage: 2.5,
    recommendedEmptyVoltage: 3.0,
    capacityAh: 5.0,
    verified: false,
  },
  {
    id: 'murata:18650:us18650vtc6',
    formFactor: '18650',
    brand: 'Murata',
    model: 'US18650VTC6',
    chemistry: 'NMC',
    nominalVoltage: 3.6,
    fullVoltage: 4.2,
    datasheetEmptyVoltage: 2.0,
    recommendedEmptyVoltage: 3.0,
    capacityAh: 3.0,
    maxContinuousDischargeA: 30,
    verified: true,
  },
]

const PRESET_BY_ID = new Map(BATTERY_CELL_PRESETS.map((preset) => [preset.id, preset]))

export function getBatteryPreset(id: string): BatteryCellPreset | null {
  return PRESET_BY_ID.get(id) ?? null
}
