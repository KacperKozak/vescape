import { expect, test } from 'bun:test'

import { getLinearGaugeValueSlot } from '@/components/charts/linearGaugeLayout'

test('places low battery value to the right of the marker when the left side is too narrow', () => {
  const slot = getLinearGaugeValueSlot({ width: 220, headX: 220 * 0.14, gap: 6 })

  expect(slot).toEqual({
    left: 220 * 0.14 + 6,
    width: 220 - 220 * 0.14 - 6,
    alignItems: 'flex-start',
  })
})

test('keeps value to the left of the marker when there is enough room', () => {
  const slot = getLinearGaugeValueSlot({ width: 220, headX: 220 * 0.6, gap: 6 })

  expect(slot).toEqual({
    left: 0,
    width: 220 * 0.6 - 6,
    alignItems: 'flex-end',
  })
})
