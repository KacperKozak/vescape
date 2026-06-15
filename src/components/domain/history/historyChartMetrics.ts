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
  { key: 'battery', label: 'Battery' },
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
