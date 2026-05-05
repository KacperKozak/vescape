import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH, fmt } from '@/helpers/format'
import { theme } from '@/constants/theme'
import { useBleStore } from '@/store/bleStore'

export default function BattCurrentScreen() {
  const recentTelemetry = useBleStore((s) => s.recentTelemetry)

  const points = useMemo<TelemetryChartPoint[]>(
    () => recentTelemetry.map((t) => ({ date: new Date(t.lastPacketAt), value: t.batteryCurrent })),
    [recentTelemetry],
  )

  const range = useMemo(() => computeAutoRange(points, { minSpan: 20 }), [points])

  const stats = useMemo(() => {
    if (!points.length) return null
    const values = points.map((p) => p.value)
    return {
      current: values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    }
  }, [points])

  const [selected, setSelected] = useState<TelemetryChartPoint | null>(null)
  const currentPoint = selected ?? points.at(-1) ?? null

  const displayValue = currentPoint ? `${fmt(currentPoint.value, 1)} A` : DASH

  return (
    <ControlDetailLayout title="Batt Current">
      <TelemetryLineChart
        label="BATTERY CURRENT"
        value={displayValue}
        points={points}
        currentPoint={currentPoint}
        color={theme.gps.color}
        range={range}
        height={120}
        onPointSelected={setSelected}
        onGestureStart={() => setSelected(null)}
      />
      <StatsRow
        current={stats ? `${fmt(stats.current, 1)} A` : DASH}
        min={stats ? `${fmt(stats.min, 1)} A` : DASH}
        max={stats ? `${fmt(stats.max, 1)} A` : DASH}
        avg={stats ? `${fmt(stats.avg, 1)} A` : DASH}
      />
    </ControlDetailLayout>
  )
}
