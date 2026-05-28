import { expect, test } from 'bun:test'

import { OPTIONAL_CHART_METRICS, toggleOptionalChartMetric } from './historyChartMetrics'

test('optional chart tabs keep the requested order', () => {
  expect(OPTIONAL_CHART_METRICS.map((metric) => metric.key)).toEqual([
    'duty',
    'battery',
    'tempMotor',
    'tempController',
    'motorCurrent',
    'batteryCurrent',
  ])
})

test('toggling an optional metric adds and removes it', () => {
  const enabledDuty = toggleOptionalChartMetric(new Set(), 'duty')
  expect(enabledDuty.has('duty')).toBe(true)

  const enabledBattery = toggleOptionalChartMetric(enabledDuty, 'battery')
  expect(enabledBattery.has('battery')).toBe(true)

  const disabledDuty = toggleOptionalChartMetric(enabledBattery, 'duty')
  expect(disabledDuty.has('duty')).toBe(false)
})
