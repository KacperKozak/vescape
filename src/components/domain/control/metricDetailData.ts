import type { TelemetryChartPoint } from '@/components/ui/charts/chartMath'
import type { LiveMetricPoint } from '@/hooks/useLiveMetric'

export function toTelemetryChartPoints(samples: readonly LiveMetricPoint[]): TelemetryChartPoint[] {
  return samples.map((p) => ({ date: new Date(p.ts), value: p.value }))
}
