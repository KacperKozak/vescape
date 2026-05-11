export type OptionalChartMetric =
  | 'duty'
  | 'battery'
  | 'tempMotor'
  | 'tempController'
  | 'motorCurrent'
  | 'batteryCurrent'

export const OPTIONAL_CHART_METRICS: ReadonlyArray<{
  key: OptionalChartMetric
  label: string
  multilineLabel?: [string, string]
}> = [
  { key: 'duty', label: 'Duty Cycle', multilineLabel: ['Duty', 'Cycle'] },
  { key: 'battery', label: 'Battery Voltage', multilineLabel: ['Battery', 'Voltage'] },
  { key: 'tempMotor', label: 'Motor Temp', multilineLabel: ['Motor', 'Temp'] },
  { key: 'tempController', label: 'Controller Temp', multilineLabel: ['Controller', 'Temp'] },
  { key: 'motorCurrent', label: 'Motor Current', multilineLabel: ['Motor', 'Current'] },
  { key: 'batteryCurrent', label: 'Batt Current', multilineLabel: ['Batt', 'Current'] },
]

export type VisibleChartMetric = 'speed' | OptionalChartMetric

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

export function getVisibleChartMetrics(
  activeMetrics: ReadonlySet<OptionalChartMetric>,
): VisibleChartMetric[] {
  return [
    'speed',
    ...OPTIONAL_CHART_METRICS.map((metric) => metric.key).filter((metric) =>
      activeMetrics.has(metric),
    ),
  ]
}
