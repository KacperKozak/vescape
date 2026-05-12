import { telemetry } from '@/constants/telemetry'

export type OptionalChartMetric =
  | 'duty'
  | 'battery'
  | 'tempMotor'
  | 'tempController'
  | 'motorCurrent'
  | 'batteryCurrent'

export const OPTIONAL_CHART_METRICS: readonly {
  key: OptionalChartMetric
  label: string
  multilineLabel?: [string, string]
}[] = [
  { key: 'duty', label: telemetry.duty.label, multilineLabel: ['Duty', 'Cycle'] },
  { key: 'battery', label: telemetry.battVoltage.label, multilineLabel: ['Battery', 'Voltage'] },
  { key: 'tempMotor', label: telemetry.motorTemp.label, multilineLabel: ['Motor', 'Temp'] },
  {
    key: 'tempController',
    label: telemetry.controllerTemp.label,
    multilineLabel: ['Controller', 'Temp'],
  },
  {
    key: 'motorCurrent',
    label: telemetry.motorCurrent.label,
    multilineLabel: ['Motor', 'Current'],
  },
  {
    key: 'batteryCurrent',
    label: telemetry.battCurrent.label,
    multilineLabel: ['Batt', 'Current'],
  },
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
