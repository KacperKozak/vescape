import { describe, expect, test } from 'bun:test'
import type { BoardWarning } from 'vesc-ble'

import { parseWarningDetail, warningTitle, worstSeverity } from './boardWarnings'

function warning(overrides: Partial<BoardWarning>): BoardWarning {
  return {
    boardId: 'board-a',
    kind: 'cell-spread',
    severity: 'warn',
    firstDetectedAtMs: 0,
    lastDetectedAtMs: 0,
    payloadJson: '{}',
    ...overrides,
  }
}

describe('worstSeverity', () => {
  test('returns null when there are no warnings', () => {
    expect(worstSeverity([])).toBeNull()
  })

  test('returns warn when only warn-level warnings exist', () => {
    expect(worstSeverity([warning({ severity: 'warn' }), warning({ severity: 'warn' })])).toBe(
      'warn',
    )
  })

  test('critical dominates regardless of order', () => {
    expect(worstSeverity([warning({ severity: 'warn' }), warning({ severity: 'critical' })])).toBe(
      'critical',
    )
  })
})

describe('warningTitle', () => {
  test('maps known kinds to rider-facing titles', () => {
    expect(warningTitle('footpad-disabled')).toBe('Footpad sensor disabled')
  })

  test('falls back to the raw kind for unknown detectors', () => {
    expect(warningTitle('some-future-kind')).toBe('some-future-kind')
  })
})

describe('parseWarningDetail', () => {
  test('returns [] for invalid JSON', () => {
    expect(parseWarningDetail('not json')).toEqual([])
  })

  test('returns [] for non-object payloads', () => {
    expect(parseWarningDetail('42')).toEqual([])
    expect(parseWarningDetail('[1,2]')).toEqual([])
  })

  test('humanizes keys and formats values', () => {
    expect(parseWarningDetail('{"peakSpreadV":0.27,"worstCellGroup":4,"balancing":true}')).toEqual([
      { label: 'Peak Spread V', value: '0.270' },
      { label: 'Worst Cell Group', value: '4' },
      { label: 'Balancing', value: 'yes' },
    ])
  })
})
