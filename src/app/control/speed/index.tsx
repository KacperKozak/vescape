import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH, fmtSpeed } from '@/helpers/format'
import { theme } from '@/constants/theme'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const RANGE = { y: { min: 0, max: 50 } }

export default function SpeedScreen() {
  const speed = useLiveMetric(liveSelectors.speed)
  const windowMs = useLiveWindowMs()

  const points = useMemo<TelemetryChartPoint[]>(
    () => speed.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [speed],
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

  const displayValue = currentPoint ? `${fmtSpeed(currentPoint.value)} km/h` : DASH

  return (
    <ControlDetailLayout title="Speed" controlId="speed" unit="km/h">
      <TelemetryLineChart
        label="SPEED"
        value={displayValue}
        points={points}
        currentPoint={currentPoint}
        color={theme.wheel.color}
        range={RANGE}
        height={120}
        onPointSelected={setSelected}
        onGestureStart={() => setSelected(null)}
        formatValue={(v) => `${fmtSpeed(v)} km/h`}
        windowMs={windowMs}
      />
      <StatsRow
        current={stats ? `${fmtSpeed(stats.current)} km/h` : DASH}
        min={stats ? `${fmtSpeed(stats.min)} km/h` : DASH}
        max={stats ? `${fmtSpeed(stats.max)} km/h` : DASH}
        avg={stats ? `${fmtSpeed(stats.avg)} km/h` : DASH}
      />
    </ControlDetailLayout>
  )
}
