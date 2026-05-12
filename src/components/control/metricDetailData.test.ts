import { expect, test } from 'bun:test'

import { computeMetricStats, toTelemetryChartPoints } from './metricDetailData'

test('toTelemetryChartPoints converts live samples to chart points', () => {
  const points = toTelemetryChartPoints([
    { ts: 1_000, value: 12 },
    { ts: 2_000, value: 18 },
  ])

  expect(points).toEqual([
    { date: new Date(1_000), value: 12 },
    { date: new Date(2_000), value: 18 },
  ])
})

test('computeMetricStats returns null for empty points', () => {
  expect(computeMetricStats([])).toBeNull()
})

test('computeMetricStats calculates current min max and average', () => {
  const stats = computeMetricStats([
    { date: new Date(1_000), value: 10 },
    { date: new Date(2_000), value: -5 },
    { date: new Date(3_000), value: 25 },
  ])

  expect(stats).toEqual({
    current: 25,
    min: -5,
    max: 25,
    avg: 10,
  })
})
