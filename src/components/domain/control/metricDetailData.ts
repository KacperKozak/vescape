import type { TelemetryChartPoint } from '@/components/ui/charts/chartMath'
import type { LiveMetricPoint } from '@/hooks/useLiveMetric'

export interface MetricStats {
  current: number
  min: number
  max: number
  avg: number
}

export function toTelemetryChartPoints(samples: readonly LiveMetricPoint[]): TelemetryChartPoint[] {
  return samples.map((p) => ({ date: new Date(p.ts), value: p.value }))
}

export function computeMetricStats(points: readonly TelemetryChartPoint[]): MetricStats | null {
  if (!points.length) return null
  const values = points.map((p) => p.value)
  return {
    current: values[values.length - 1],
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length,
  }
}
