import { expect, test } from 'bun:test'

import {
  computeAutoRange,
  findNearestChartPointAtX,
  getChartPosition,
  type TelemetryChartPoint,
  toExcludedRanges,
} from './chartMath'

const base = new Date('2026-01-01T00:00:00.000Z').getTime()

const points: TelemetryChartPoint[] = [
  { date: new Date(base + 0), value: 10 },
  { date: new Date(base + 1_000), value: 30 },
  { date: new Date(base + 2_000), value: 20 },
]

test('getChartPosition maps higher values upward', () => {
  const range = { y: { min: 0, max: 40 } }
  const low = getChartPosition(points, points[0], range, 100, 50)
  const high = getChartPosition(points, points[1], range, 100, 50)
  expect(low).not.toBeNull()
  expect(high).not.toBeNull()
  expect(high!.y).toBeLessThan(low!.y)
})

test('getChartPosition clamps inside bounds', () => {
  const range = { y: { min: 0, max: 100 } }
  const out: TelemetryChartPoint = { date: new Date(base + 5_000), value: 200 }
  const pos = getChartPosition(points, out, range, 100, 50)
  expect(pos).toEqual({ x: 100, y: 0 })
})

test('findNearestChartPointAtX picks nearest and clamps x', () => {
  expect(findNearestChartPointAtX(points, 0, 100)).toEqual(points[0])
  expect(findNearestChartPointAtX(points, 50, 100)).toEqual(points[1])
  expect(findNearestChartPointAtX(points, 100, 100)).toEqual(points[2])
  expect(findNearestChartPointAtX(points, -1_000, 100)).toEqual(points[0])
  expect(findNearestChartPointAtX(points, 1_000, 100)).toEqual(points[2])
})

test('computeAutoRange supports zero include and min span', () => {
  const positive = [
    { date: new Date(base), value: 12 },
    { date: new Date(base + 1_000), value: 18 },
  ]
  const range = computeAutoRange(positive, {
    includeZero: true,
    minSpan: 10,
    paddingRatio: 0.1,
  })
  expect(range.y.min).toBeLessThanOrEqual(0)
  expect(range.y.max - range.y.min).toBeGreaterThanOrEqual(11)
})

test('toExcludedRanges filters by metric map and merges nearby ranges', () => {
  const ranges = toExcludedRanges(
    [
      { startMs: 1_000, endMs: 2_000, reason: 'low_speed', metrics: { avg_speed: true } },
      { startMs: 3_000, endMs: 4_000, reason: 'low_speed', metrics: { avg_speed: true } },
      { startMs: 8_000, endMs: 9_000, reason: 'free_spin', metrics: { max_duty: true } },
    ],
    'avg_speed',
  )

  expect(ranges).toEqual([{ startMs: 1_000, endMs: 4_000, reason: 'low_speed' }])
})

test('toExcludedRanges supports multi-metric filters', () => {
  const ranges = toExcludedRanges(
    [
      { startMs: 1_000, endMs: 2_000, reason: 'low_speed', metrics: { avg_speed: true } },
      { startMs: 7_000, endMs: 8_000, reason: 'free_spin', metrics: { max_speed: true } },
      { startMs: 12_000, endMs: 13_000, reason: 'free_spin', metrics: { max_duty: true } },
    ],
    ['avg_speed', 'max_speed'],
  )

  expect(ranges).toEqual([
    { startMs: 1_000, endMs: 2_000, reason: 'low_speed' },
    { startMs: 7_000, endMs: 8_000, reason: 'free_spin' },
  ])
})

test('toExcludedRanges does not merge nearby ranges with different reasons', () => {
  const ranges = toExcludedRanges(
    [
      { startMs: 1_000, endMs: 2_000, reason: 'low_speed', metrics: { avg_speed: true } },
      { startMs: 2_200, endMs: 3_000, reason: 'free_spin', metrics: { avg_speed: true } },
    ],
    'avg_speed',
  )

  expect(ranges).toEqual([
    { startMs: 1_000, endMs: 2_000, reason: 'low_speed' },
    { startMs: 2_200, endMs: 3_000, reason: 'free_spin' },
  ])
})
