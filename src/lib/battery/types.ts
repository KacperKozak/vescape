import type { BatteryConfig, BatteryPresetConfig } from 'vesc-ble'

export interface BatterySocPoint {
  voltage: number
  soc: number
}

export interface BatteryCellPreset {
  id: string
  formFactor: string
  brand: string
  model: string
  chemistry: string
  nominalVoltage: number
  fullVoltage: number
  datasheetEmptyVoltage: number
  recommendedEmptyVoltage: number
  capacityAh: number
  maxContinuousDischargeA?: number
  verified: boolean
  socCurve: BatterySocPoint[]
}

export interface DerivedBatteryConfig {
  mode: BatteryConfig['mode']
  minVoltage: number
  maxVoltage: number
  nominalVoltage: number | null
  nominalWh: number | null
  preset: BatteryCellPreset | null
  warning: 'missing' | 'unknown-preset' | 'invalid' | null
}
