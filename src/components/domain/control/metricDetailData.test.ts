import { expect, test } from 'bun:test'

import { toTelemetryChartPoints } from './metricDetailData'

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
