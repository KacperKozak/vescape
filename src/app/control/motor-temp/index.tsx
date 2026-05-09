import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH, fmt } from '@/helpers/format'
import { CHART_DEFAULTS } from '@/constants/chartDefaults'
import { theme } from '@/constants/theme'
import { useBleStore } from '@/store/bleStore'

export default function MotorTempScreen() {
  const recentTelemetry = useBleStore((s) => s.recentTelemetry)

  const points = useMemo<TelemetryChartPoint[]>(
    () =>
      recentTelemetry.flatMap((t) =>
        t.tempMotor != null && t.tempMotor > 0
          ? [{ date: new Date(t.lastPacketAt), value: t.tempMotor }]
          : [],
      ),
    [recentTelemetry],
  )

  const range = useMemo(
    () => computeAutoRange(points, { baseline: CHART_DEFAULTS.motorTemp }),
    [points],
  )

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

  const displayValue = currentPoint ? `${fmt(currentPoint.value, 1)} °C` : DASH

  return (
    <ControlDetailLayout title="Motor Temp" controlId="motor-temp" unit="°C">
      <TelemetryLineChart
        label="MOTOR TEMP"
        value={displayValue}
        points={points}
        currentPoint={currentPoint}
        color={theme.warning.color}
        range={range}
        height={120}
        onPointSelected={setSelected}
        onGestureStart={() => setSelected(null)}
        formatValue={(v) => `${fmt(v, 1)} °C`}
      />
      <StatsRow
        current={stats ? `${fmt(stats.current, 1)} °C` : DASH}
        min={stats ? `${fmt(stats.min, 1)} °C` : DASH}
        max={stats ? `${fmt(stats.max, 1)} °C` : DASH}
        avg={stats ? `${fmt(stats.avg, 1)} °C` : DASH}
      />
    </ControlDetailLayout>
  )
}
