import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH, fmtTemp } from '@/helpers/format'
import { CHART_DEFAULTS } from '@/constants/chartDefaults'
import { theme } from '@/constants/theme'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

export default function ControllerTempScreen() {
  const controllerTemp = useLiveMetric(liveSelectors.controllerTemp)
  const windowMs = useLiveWindowMs()

  const points = useMemo<TelemetryChartPoint[]>(
    () => controllerTemp.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [controllerTemp],
  )

  const range = useMemo(
    () => computeAutoRange(points, { baseline: CHART_DEFAULTS.controllerTemp }),
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

  const displayValue = currentPoint ? `${fmtTemp(currentPoint.value)} °C` : DASH

  return (
    <ControlDetailLayout title="Controller Temp" controlId="controller-temp" unit="°C">
      <TelemetryLineChart
        label="CONTROLLER TEMP"
        value={displayValue}
        points={points}
        currentPoint={currentPoint}
        color={theme.warning.color}
        range={range}
        height={120}
        onPointSelected={setSelected}
        onGestureStart={() => setSelected(null)}
        formatValue={(v) => `${fmtTemp(v)} °C`}
        windowMs={windowMs}
      />
      <StatsRow
        current={stats ? `${fmtTemp(stats.current)} °C` : DASH}
        min={stats ? `${fmtTemp(stats.min)} °C` : DASH}
        max={stats ? `${fmtTemp(stats.max)} °C` : DASH}
        avg={stats ? `${fmtTemp(stats.avg)} °C` : DASH}
      />
    </ControlDetailLayout>
  )
}
