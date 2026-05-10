import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH, fmtCurrent } from '@/helpers/format'
import { CHART_DEFAULTS } from '@/constants/chartDefaults'
import { theme } from '@/constants/theme'
import { useBleStore } from '@/store/bleStore'
import { useLiveWindowMs } from '@/store/settingsStore'

export default function MotorCurrentScreen() {
  const motorCurrent = useBleStore((s) => s.liveMetricHistory.motorCurrent)
  const windowMs = useLiveWindowMs()

  const points = useMemo<TelemetryChartPoint[]>(
    () => motorCurrent.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [motorCurrent],
  )

  const range = useMemo(
    () => computeAutoRange(points, { baseline: CHART_DEFAULTS.motorCurrent }),
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

  const displayValue = currentPoint ? `${fmtCurrent(currentPoint.value)} A` : DASH

  return (
    <ControlDetailLayout title="Motor Current" controlId="motor-current" unit="A">
      <TelemetryLineChart
        label="MOTOR CURRENT"
        value={displayValue}
        points={points}
        currentPoint={currentPoint}
        color={theme.bran.color}
        range={range}
        height={120}
        onPointSelected={setSelected}
        onGestureStart={() => setSelected(null)}
        formatValue={(v) => `${fmtCurrent(v)} A`}
        windowMs={windowMs}
      />
      <StatsRow
        current={stats ? `${fmtCurrent(stats.current)} A` : DASH}
        min={stats ? `${fmtCurrent(stats.min)} A` : DASH}
        max={stats ? `${fmtCurrent(stats.max)} A` : DASH}
        avg={stats ? `${fmtCurrent(stats.avg)} A` : DASH}
      />
    </ControlDetailLayout>
  )
}
