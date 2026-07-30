import { expect, test } from 'bun:test'

import {
  formatFavoriteName,
  formatRideListDateTime,
  formatRideListDetails,
} from '@/modules/history/lib/rideFormat'

test('list date combines the ride time range with the readable calendar date', () => {
  const start = new Date(2026, 6, 10, 23, 30).getTime()
  const end = new Date(2026, 6, 10, 23, 34).getTime()

  expect(formatRideListDateTime(start, end)).toBe('23:30 – 23:34 · 10 Jul 2026')
})

test('list details use contextual duration units and keep the board last', () => {
  expect(formatRideListDetails(50 * 60_000, 1_820, 'Thor3')).toBe('50 min · 1.82 km · Thor3')
  expect(formatRideListDetails(83 * 60_000, 12_840, 'Very Long Board Name')).toBe(
    '1h 23m · 12.84 km · Very Long Board Name',
  )
})

test('unnamed favorites have an explicit identity', () => {
  expect(formatFavoriteName(null)).toBe('Unnamed favorite')
  expect(formatFavoriteName('  ')).toBe('Unnamed favorite')
  expect(formatFavoriteName(' Forest run ')).toBe('Forest run')
})
