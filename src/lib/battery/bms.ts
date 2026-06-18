import type { BmsEvent } from 'vesc-ble'

export interface BmsCellGroup {
  index: number
  voltage: number
  balancing: boolean
  /** True for the lowest-voltage group, false for the highest, null otherwise. */
  extreme: 'min' | 'max' | null
}

export interface BmsSummary {
  cellCount: number
  groups: BmsCellGroup[]
  minVoltage: number
  maxVoltage: number
  /** max − min across cell groups. The headline imbalance number. */
  spread: number
  /** Mean cell-group voltage. */
  average: number
  voltageTotal: number
}

/**
 * Reduce a raw BMS snapshot into per-group rows plus pack-level min/max/spread.
 * Returns null when the snapshot carries no usable cell voltages.
 */
export function summarizeBms(bms: BmsEvent | null): BmsSummary | null {
  if (!bms) return null
  const cells = bms.cellVoltages.filter((v) => Number.isFinite(v) && v > 0)
  if (cells.length === 0) return null

  const minVoltage = Math.min(...cells)
  const maxVoltage = Math.max(...cells)
  const average = cells.reduce((sum, v) => sum + v, 0) / cells.length

  // Only tag extremes when there is a real imbalance, otherwise every group at the
  // same voltage would flicker a min/max badge.
  const hasSpread = maxVoltage - minVoltage > 0.0005

  const groups: BmsCellGroup[] = bms.cellVoltages.map((voltage, index) => ({
    index,
    voltage,
    balancing: bms.balancing[index] ?? false,
    extreme: !hasSpread
      ? null
      : voltage === minVoltage
        ? 'min'
        : voltage === maxVoltage
          ? 'max'
          : null,
  }))

  return {
    cellCount: cells.length,
    groups,
    minVoltage,
    maxVoltage,
    spread: maxVoltage - minVoltage,
    average,
    voltageTotal: bms.voltageTotal,
  }
}
