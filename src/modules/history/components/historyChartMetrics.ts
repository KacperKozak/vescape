import type { AutoRangeOptions } from '@/components/charts/chartMath'
import { telemetry } from '@/modules/board/constants/telemetry'
import type { HistoryMetricKey } from '@/modules/history/lib/metricColorScale'

export type OptionalChartMetric =
  | 'duty'
  | 'battery'
  | 'tempMotor'
  | 'tempController'
  | 'motorCurrent'
  | 'batteryCurrent'

export interface ChartMetricDef {
  key: HistoryMetricKey
  label: string
  color: string
  range: AutoRangeOptions
  /** Scrub/axis value formatting. */
  formatValue: (value: number) => string
  /** Header value formatting when it differs from formatValue (e.g. rounded duty). */
  formatHeadValue?: (value: number) => string
  /** Session-exclusion stat keys that grey out this chart's ranges. */
  statKeys?: string | string[]
}

export interface OptionalChartMetricDef extends ChartMetricDef {
  key: OptionalChartMetric
  multilineLabel?: [string, string]
}

export const SPEED_CHART_DEF: ChartMetricDef = {
  key: 'speed',
  label: telemetry.speed.label,
  color: telemetry.speed.color,
  range: { includeZero: true, minSpan: 10, paddingRatio: 0.1, fallbackMin: -5, fallbackMax: 5 },
  formatValue: telemetry.speed.formatWithUnit,
  statKeys: ['avg_speed', 'max_speed'],
}

export const OPTIONAL_CHART_METRICS: readonly OptionalChartMetricDef[] = [
  {
    key: 'duty',
    label: telemetry.duty.label,
    multilineLabel: ['Duty', 'Cycle'],
    color: telemetry.duty.color,
    range: { includeZero: true, minSpan: 20, paddingRatio: 0.1, fallbackMin: 0, fallbackMax: 100 },
    formatValue: (value) => `${value.toFixed(1)}%`,
    formatHeadValue: (value) => `${value.toFixed(0)}%`,
    statKeys: 'max_duty',
  },
  {
    key: 'battery',
    label: 'Battery',
    color: telemetry.battVoltage.color,
    range: { includeZero: false, minSpan: 5, paddingRatio: 0.1, fallbackMin: 30, fallbackMax: 60 },
    formatValue: telemetry.battVoltage.formatWithUnit,
  },
  {
    key: 'tempMotor',
    label: telemetry.motorTemp.label,
    multilineLabel: ['Motor', 'Temp'],
    color: telemetry.motorTemp.color,
    range: { includeZero: false, minSpan: 20, paddingRatio: 0.1, fallbackMin: 0, fallbackMax: 100 },
    formatValue: telemetry.motorTemp.formatWithUnit,
  },
  {
    key: 'tempController',
    label: telemetry.controllerTemp.label,
    multilineLabel: ['Controller', 'Temp'],
    color: telemetry.controllerTemp.color,
    range: { includeZero: false, minSpan: 20, paddingRatio: 0.1, fallbackMin: 0, fallbackMax: 100 },
    formatValue: telemetry.controllerTemp.formatWithUnit,
  },
  {
    key: 'motorCurrent',
    label: telemetry.motorCurrent.label,
    multilineLabel: ['Motor', 'Current'],
    color: telemetry.motorCurrent.color,
    range: { includeZero: true, minSpan: 10, paddingRatio: 0.1, fallbackMin: -5, fallbackMax: 5 },
    formatValue: telemetry.motorCurrent.formatWithUnit,
  },
  {
    key: 'batteryCurrent',
    label: telemetry.battCurrent.label,
    multilineLabel: ['Batt', 'Current'],
    color: telemetry.battCurrent.color,
    range: { includeZero: true, minSpan: 5, paddingRatio: 0.1, fallbackMin: -5, fallbackMax: 5 },
    formatValue: telemetry.battCurrent.formatWithUnit,
  },
]

export const HISTORY_CHART_DEFS: readonly ChartMetricDef[] = [
  SPEED_CHART_DEF,
  ...OPTIONAL_CHART_METRICS,
]

export function toggleOptionalChartMetric(
  activeMetrics: ReadonlySet<OptionalChartMetric>,
  metric: OptionalChartMetric,
): Set<OptionalChartMetric> {
  const next = new Set(activeMetrics)
  if (next.has(metric)) {
    next.delete(metric)
  } else {
    next.add(metric)
  }
  return next
}
