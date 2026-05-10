import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH } from '@/helpers/format'
import { theme } from '@/constants/theme'
import { useBleStore } from '@/store/bleStore'
import { useLiveWindowMs } from '@/store/settingsStore'

const RANGE = { y: { min: 0, max: 100 } }

export default function DutyScreen() {
  const duty = useBleStore((s) => s.liveMetricHistory.duty)
  const windowMs = useLiveWindowMs()

  const points = useMemo<TelemetryChartPoint[]>(
    () => duty.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [duty],
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

  const displayValue = currentPoint ? `${currentPoint.value.toFixed(0)} %` : DASH

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
        formatValue={(v) => `${v.toFixed(0)} %`}
        windowMs={windowMs}
      />
      <StatsRow
        current={stats ? `${stats.current.toFixed(0)} %` : DASH}
        min={stats ? `${stats.min.toFixed(0)} %` : DASH}
        max={stats ? `${stats.max.toFixed(0)} %` : DASH}
        avg={stats ? `${stats.avg.toFixed(0)} %` : DASH}
      />
    </ControlDetailLayout>
  )
}
