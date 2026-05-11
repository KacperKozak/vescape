import { expect, test } from 'bun:test'

import {
  getVisibleChartMetrics,
  OPTIONAL_CHART_METRICS,
  toggleOptionalChartMetric,
} from './historyChartMetrics'

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

test('speed chart is always visible by default', () => {
  expect(getVisibleChartMetrics(new Set())).toEqual(['speed'])
})

test('toggling an optional metric adds and removes it while keeping speed first', () => {
  const enabledDuty = toggleOptionalChartMetric(new Set(), 'duty')
  expect(getVisibleChartMetrics(enabledDuty)).toEqual(['speed', 'duty'])

  const enabledBattery = toggleOptionalChartMetric(enabledDuty, 'battery')
  expect(getVisibleChartMetrics(enabledBattery)).toEqual(['speed', 'duty', 'battery'])

  const disabledDuty = toggleOptionalChartMetric(enabledBattery, 'duty')
  expect(getVisibleChartMetrics(disabledDuty)).toEqual(['speed', 'battery'])
})
