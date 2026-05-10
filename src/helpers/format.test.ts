import { describe, expect, test } from 'bun:test'

import { dutyPercent, fmtDutyPercent } from './format'

describe('dutyPercent', () => {
  test('hides ReFloat idle quantization', () => {
    expect(dutyPercent(0.01)).toBe(0)
    expect(dutyPercent(-0.01, false)).toBe(0)
  })

  test('formats whole percent labels', () => {
    expect(fmtDutyPercent(0.024)).toBe('2%')
    expect(fmtDutyPercent(-0.024, false)).toBe('-2%')
  })
})
