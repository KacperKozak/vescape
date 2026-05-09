import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH, fmt } from '@/helpers/format'
import { theme } from '@/constants/theme'
import { useBleStore } from '@/store/bleStore'
import { useLiveWindowMs } from '@/store/settingsStore'

const RANGE = { y: { min: 0, max: 100 } }

export default function DutyScreen() {
  const recentTelemetry = useBleStore((s) => s.recentTelemetry)
  const windowMs = useLiveWindowMs()

  const points = useMemo<TelemetryChartPoint[]>(
    () =>
      recentTelemetry.map((t) => ({
        date: new Date(t.lastPacketAt),
        value: Math.abs(t.dutyCycle) * 100,
      })),
    [recentTelemetry],
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

  const displayValue = currentPoint ? `${fmt(currentPoint.value, 1)} %` : DASH

  return (
    <ControlDetailLayout title="Duty Cycle" controlId="duty" unit="%">
      <TelemetryLineChart
        label="DUTY CYCLE"
        value={displayValue}
        points={points}
        currentPoint={currentPoint}
        color={theme.bran.color}
        range={RANGE}
        height={120}
        onPointSelected={setSelected}
        onGestureStart={() => setSelected(null)}
        formatValue={(v) => `${fmt(v, 1)} %`}
        windowMs={windowMs}
      />
      <StatsRow
        current={stats ? `${fmt(stats.current, 1)} %` : DASH}
        min={stats ? `${fmt(stats.min, 1)} %` : DASH}
        max={stats ? `${fmt(stats.max, 1)} %` : DASH}
        avg={stats ? `${fmt(stats.avg, 1)} %` : DASH}
      />
    </ControlDetailLayout>
  )
}
