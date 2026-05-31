import type { BatteryConfig } from 'vesc-ble'

import type { DerivedBatteryConfig } from './types'
import { getBatteryPreset } from './data'

export function deriveBatteryConfig(
  config: BatteryConfig | null | undefined,
): DerivedBatteryConfig {
  if (!config) {
    return {
      mode: 'manual',
      minVoltage: 0,
      maxVoltage: 0,
      nominalVoltage: null,
      nominalWh: null,
      preset: null,
      warning: 'missing',
    }
  }

  if (config.mode === 'manual') {
    const valid = config.maxVoltage > config.minVoltage
    return {
      mode: 'manual',
      minVoltage: config.minVoltage,
      maxVoltage: config.maxVoltage,
      nominalVoltage: valid ? (config.minVoltage + config.maxVoltage) / 2 : null,
      nominalWh: null,
      preset: null,
      warning: valid ? null : 'invalid',
    }
  }

  const preset = getBatteryPreset(config.cellPresetId)
  if (!preset) {
    return {
      mode: 'preset',
      minVoltage: 0,
      maxVoltage: 0,
      nominalVoltage: null,
      nominalWh: null,
      preset: null,
      warning: 'unknown-preset',
    }
  }

  const series = Math.max(1, Math.trunc(config.seriesCount))
  const parallel = Math.max(1, Math.trunc(config.parallelCount))
  return {
    mode: 'preset',
    minVoltage: preset.recommendedEmptyVoltage * series,
    maxVoltage: preset.fullVoltage * series,
    nominalVoltage: preset.nominalVoltage * series,
    nominalWh: preset.nominalVoltage * series * preset.capacityAh * parallel,
    preset,
    warning: null,
  }
}
