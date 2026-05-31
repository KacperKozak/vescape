import type { BatteryPresetConfig } from 'vesc-ble'

import type { BatteryCellPreset } from './types'

import cellPresetsJson from '../../../shared/data/cell-presets.json'

export const DEFAULT_BATTERY_CONFIG: BatteryPresetConfig = {
  mode: 'preset',
  cellPresetId: 'molicel:21700:p50b',
  seriesCount: 20,
  parallelCount: 2,
}

export const BATTERY_CELL_PRESETS: BatteryCellPreset[] =
  cellPresetsJson.cells as BatteryCellPreset[]

const PRESET_BY_ID = new Map(BATTERY_CELL_PRESETS.map((preset) => [preset.id, preset]))

export function getBatteryPreset(id: string): BatteryCellPreset | null {
  return PRESET_BY_ID.get(id) ?? null
}
