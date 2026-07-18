import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import type { LiveMetricPoint } from '@/modules/board/hooks/useLiveMetric'

export function toTelemetryChartPoints(samples: readonly LiveMetricPoint[]): TelemetryChartPoint[] {
  return samples.map((p) => ({ date: new Date(p.ts), value: p.value }))
}
