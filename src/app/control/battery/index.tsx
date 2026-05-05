import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH, fmt } from '@/helpers/format'
import { theme } from '@/constants/theme'
import { useBleStore } from '@/store/bleStore'

export default function BatteryScreen() {
  const recentTelemetry = useBleStore((s) => s.recentTelemetry)

  const points = useMemo<TelemetryChartPoint[]>(
    () => recentTelemetry.map((t) => ({ date: new Date(t.lastPacketAt), value: t.batteryVoltage })),
    [recentTelemetry],
  )

  const range = useMemo(() => computeAutoRange(points, { minSpan: 2 }), [points])

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

  const displayValue = currentPoint ? `${fmt(currentPoint.value, 2)} V` : DASH

  return (
    <ControlDetailLayout title="Battery Voltage">
      <TelemetryLineChart
        label="BATTERY VOLTAGE"
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
        current={stats ? `${fmt(stats.current, 2)} V` : DASH}
        min={stats ? `${fmt(stats.min, 2)} V` : DASH}
        max={stats ? `${fmt(stats.max, 2)} V` : DASH}
        avg={stats ? `${fmt(stats.avg, 2)} V` : DASH}
      />
    </ControlDetailLayout>
  )
}
