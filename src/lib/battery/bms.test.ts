import { describe, expect, it } from 'bun:test'
import type { BmsEvent } from 'vesc-ble'

import { summarizeBms } from './bms'

function makeBms(cellVoltages: number[], balancing: boolean[] = []): BmsEvent {
  return {
    capturedAt: 1000,
    voltageTotal: cellVoltages.reduce((s, v) => s + v, 0),
    current: 0,
    ampHours: 0,
    wattHours: 0,
    soc: null,
    cellVoltages,
    balancing,
  }
}

describe('summarizeBms', () => {
  it('returns null without usable cells', () => {
    expect(summarizeBms(null)).toBeNull()
    expect(summarizeBms(makeBms([]))).toBeNull()
    expect(summarizeBms(makeBms([0, 0]))).toBeNull()
  })

  it('computes min, max, spread and average across groups', () => {
    const summary = summarizeBms(makeBms([3.9, 4.1, 4.0]))
    expect(summary).not.toBeNull()
    expect(summary!.cellCount).toBe(3)
    expect(summary!.minVoltage).toBeCloseTo(3.9)
    expect(summary!.maxVoltage).toBeCloseTo(4.1)
    expect(summary!.spread).toBeCloseTo(0.2)
    expect(summary!.average).toBeCloseTo(4.0)
  })

  it('tags the lowest and highest groups when imbalanced', () => {
    const summary = summarizeBms(makeBms([3.9, 4.1, 4.0]))!
    expect(summary.groups[0].extreme).toBe('min')
    expect(summary.groups[1].extreme).toBe('max')
    expect(summary.groups[2].extreme).toBeNull()
  })

  it('tags no extremes when the pack is balanced', () => {
    const summary = summarizeBms(makeBms([4.0, 4.0, 4.0]))!
    expect(summary.spread).toBeCloseTo(0)
    expect(summary.groups.every((g) => g.extreme === null)).toBe(true)
  })

  it('carries the balancing flag per group, defaulting missing flags to false', () => {
    const summary = summarizeBms(makeBms([3.9, 4.1], [false, true]))!
    expect(summary.groups[0].balancing).toBe(false)
    expect(summary.groups[1].balancing).toBe(true)

    const noFlags = summarizeBms(makeBms([3.9, 4.1]))!
    expect(noFlags.groups.every((g) => g.balancing === false)).toBe(true)
  })

  it('ignores zero/garbage cells when computing extremes but keeps them as rows', () => {
    const summary = summarizeBms(makeBms([4.0, 0, 3.8]))!
    expect(summary.cellCount).toBe(2)
    expect(summary.minVoltage).toBeCloseTo(3.8)
    expect(summary.maxVoltage).toBeCloseTo(4.0)
    expect(summary.groups).toHaveLength(3)
  })
})
