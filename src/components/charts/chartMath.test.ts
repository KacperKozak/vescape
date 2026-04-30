import { expect, test } from 'bun:test'

import {
  computeAutoRange,
  findNearestChartPointAtX,
  getChartPosition,
  type TelemetryChartPoint,
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
