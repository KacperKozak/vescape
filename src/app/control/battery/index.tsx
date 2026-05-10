import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH, fmtVoltage } from '@/helpers/format'
import { theme } from '@/constants/theme'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useBoardStore } from '@/store/boardStore'
import { useLiveWindowMs } from '@/store/settingsStore'

export default function BatteryScreen() {
  const batteryVoltage = useLiveMetric(liveSelectors.batteryVoltage)
  const windowMs = useLiveWindowMs()
  const board = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))

  const points = useMemo<TelemetryChartPoint[]>(
    () => batteryVoltage.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [batteryVoltage],
  )

  const range = useMemo(() => {
    if (board?.minVoltage != null && board?.maxVoltage != null) {
      return { y: { min: board.minVoltage, max: board.maxVoltage } }
    }
    return computeAutoRange(points, { minSpan: 2 })
  }, [board?.minVoltage, board?.maxVoltage, points])

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

  const displayValue = currentPoint ? `${fmtVoltage(currentPoint.value)} V` : DASH

  return (
    <ControlDetailLayout title="Battery Voltage" controlId="battery" unit="V">
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
        formatValue={(v) => `${fmtVoltage(v)} V`}
        windowMs={windowMs}
      />
      <StatsRow
        current={stats ? `${fmtVoltage(stats.current)} V` : DASH}
        min={stats ? `${fmtVoltage(stats.min)} V` : DASH}
        max={stats ? `${fmtVoltage(stats.max)} V` : DASH}
        avg={stats ? `${fmtVoltage(stats.avg)} V` : DASH}
      />
    </ControlDetailLayout>
  )
}
