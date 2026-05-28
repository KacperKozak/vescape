import { useMemo, useState } from 'react'

import { TelemetryLineChart } from '@/components/ui/charts/TelemetryLineChart'
import type {
  ExcludedRange,
  TelemetryChartPoint,
  TelemetryChartRange,
} from '@/components/ui/charts/chartMath'
import { StatsRow } from '@/components/ui/base/StatsRow'
import { computeMetricStats } from '@/components/domain/control/metricDetailData'
import type { TelemetryMetricConfig } from '@/constants/telemetry'
import { DASH } from '@/helpers/format'

interface MetricDetailChartProps {
  metric: TelemetryMetricConfig
  points: TelemetryChartPoint[]
  range: TelemetryChartRange
  windowMs: number
  height?: number
  showStats?: boolean
  formatValue?: (value: number) => string
  label?: string
  excludedRanges?: ExcludedRange[]
}

export function MetricDetailChart({
  metric,
  points,
  range,
  windowMs,
  height = 120,
  showStats = true,
  formatValue = metric.formatWithUnit,
  label = metric.label.toUpperCase(),
  excludedRanges,
}: MetricDetailChartProps) {
  const stats = useMemo(() => computeMetricStats(points), [points])
  const [selected, setSelected] = useState<TelemetryChartPoint | null>(null)
  const currentPoint = selected ?? points.at(-1) ?? null
  const displayValue = currentPoint ? formatValue(currentPoint.value) : DASH

  return (
    <>
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
      />
      {showStats ? (
        <StatsRow
          current={stats ? formatValue(stats.current) : DASH}
          min={stats ? formatValue(stats.min) : DASH}
          max={stats ? formatValue(stats.max) : DASH}
          avg={stats ? formatValue(stats.avg) : DASH}
        />
      ) : null}
    </>
  )
}
