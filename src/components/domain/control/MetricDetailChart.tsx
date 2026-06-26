import { useMemo, useState } from 'react'

import { TelemetryLineChart } from '@/components/ui/charts/TelemetryLineChart'
import type {
  ExcludedRange,
  TelemetryChartPoint,
  TelemetryChartRange,
} from '@/components/ui/charts/chartMath'
import type { TelemetryMetricConfig } from '@/constants/telemetry'
import { DASH } from '@/helpers/format'

interface SecondaryMetricSeries {
  points: TelemetryChartPoint[]
  range: TelemetryChartRange
  color: string
  formatValue: (value: number) => string
}

interface MetricDetailChartProps {
  metric: TelemetryMetricConfig
  points: TelemetryChartPoint[]
  range: TelemetryChartRange
  windowMs: number
  height?: number
  formatValue?: (value: number) => string
  label?: string
  excludedRanges?: ExcludedRange[]
  secondary?: SecondaryMetricSeries
}

function valueAtTime(points: TelemetryChartPoint[], timeMs: number): TelemetryChartPoint | null {
  if (points.length === 0) return null
  let best = points[0]
  let bestDistance = Math.abs(best.date.getTime() - timeMs)
  for (const point of points) {
    const distance = Math.abs(point.date.getTime() - timeMs)
    if (distance < bestDistance) {
      best = point
      bestDistance = distance
    }
  }
  return best
}

export function MetricDetailChart({
  metric,
  points,
  range,
  windowMs,
  height = 120,
  formatValue = metric.formatWithUnit,
  label,
  excludedRanges,
  secondary,
}: MetricDetailChartProps) {
  const [selected, setSelected] = useState<TelemetryChartPoint | null>(null)
  const currentPoint = selected ?? points.at(-1) ?? null
  const displayValue = currentPoint ? formatValue(currentPoint.value) : DASH

  const secondarySeries = useMemo(() => {
    if (!secondary || secondary.points.length === 0) return undefined
    const at = currentPoint
      ? valueAtTime(secondary.points, currentPoint.date.getTime())
      : (secondary.points.at(-1) ?? null)
    return {
      points: secondary.points,
      range: secondary.range,
      color: secondary.color,
      value: at ? secondary.formatValue(at.value) : DASH,
      formatValue: secondary.formatValue,
    }
  }, [secondary, currentPoint])

  return (
    <TelemetryLineChart
      label={label}
      value={displayValue}
      points={points}
      currentPoint={currentPoint}
      color={metric.color}
      range={range}
      height={height}
      onPointSelected={setSelected}
      onGestureStart={() => setSelected(null)}
      formatValue={formatValue}
      windowMs={windowMs}
      excludedRanges={excludedRanges}
      secondary={secondarySeries}
    />
  )
}
