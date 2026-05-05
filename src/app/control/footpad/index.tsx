import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH, fmt } from '@/helpers/format'
import { theme } from '@/constants/theme'
import { useBleStore } from '@/store/bleStore'

function computeStats(points: TelemetryChartPoint[]) {
  if (!points.length) return null
  const values = points.map((p) => p.value)
  return {
    current: values[values.length - 1],
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length,
  }
}

export default function FootpadScreen() {
  const recentTelemetry = useBleStore((s) => s.recentTelemetry)

  const adc1Points = useMemo<TelemetryChartPoint[]>(
    () => recentTelemetry.map((t) => ({ date: new Date(t.lastPacketAt), value: t.adc1 })),
    [recentTelemetry],
  )

  const adc2Points = useMemo<TelemetryChartPoint[]>(
    () => recentTelemetry.map((t) => ({ date: new Date(t.lastPacketAt), value: t.adc2 })),
    [recentTelemetry],
  )

  const adc1Range = useMemo(() => computeAutoRange(adc1Points, { minSpan: 0.5 }), [adc1Points])
  const adc2Range = useMemo(() => computeAutoRange(adc2Points, { minSpan: 0.5 }), [adc2Points])

  const adc1Stats = useMemo(() => computeStats(adc1Points), [adc1Points])
  const adc2Stats = useMemo(() => computeStats(adc2Points), [adc2Points])

  const [selected1, setSelected1] = useState<TelemetryChartPoint | null>(null)
  const [selected2, setSelected2] = useState<TelemetryChartPoint | null>(null)
  const current1 = selected1 ?? adc1Points.at(-1) ?? null
  const current2 = selected2 ?? adc2Points.at(-1) ?? null

  return (
    <ControlDetailLayout title="Footpad" controlId="footpad">
      <TelemetryLineChart
        label="ADC 1"
        value={current1 ? fmt(current1.value, 3) : DASH}
        points={adc1Points}
        currentPoint={current1}
        color={theme.wheel.color}
        range={adc1Range}
        height={80}
        onPointSelected={setSelected1}
        onGestureStart={() => setSelected1(null)}
      />
      <StatsRow
        current={adc1Stats ? fmt(adc1Stats.current, 3) : DASH}
        min={adc1Stats ? fmt(adc1Stats.min, 3) : DASH}
        max={adc1Stats ? fmt(adc1Stats.max, 3) : DASH}
        avg={adc1Stats ? fmt(adc1Stats.avg, 3) : DASH}
      />

      <TelemetryLineChart
        label="ADC 2"
        value={current2 ? fmt(current2.value, 3) : DASH}
        points={adc2Points}
        currentPoint={current2}
        color={theme.bran.color}
        range={adc2Range}
        height={80}
        onPointSelected={setSelected2}
        onGestureStart={() => setSelected2(null)}
      />
      <StatsRow
        current={adc2Stats ? fmt(adc2Stats.current, 3) : DASH}
        min={adc2Stats ? fmt(adc2Stats.min, 3) : DASH}
        max={adc2Stats ? fmt(adc2Stats.max, 3) : DASH}
        avg={adc2Stats ? fmt(adc2Stats.avg, 3) : DASH}
      />
    </ControlDetailLayout>
  )
}
