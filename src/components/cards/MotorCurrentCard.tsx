import { useMemo } from 'react'

import { type SparklinePoint } from '@/components/charts/Sparkline'
import { TelemetryCard } from '@/components/TelemetryCard'
import { theme } from '@/constants/theme'
import { DASH, fmt } from '@/helpers/format'
import { useBleStore } from '@/store/bleStore'

const FMT_MAX = (v: number) => `${v.toFixed(0)} A`
const MIN_SPAN = 20

export function MotorCurrentCard() {
  const recentTelemetry = useBleStore((s) => s.recentTelemetry)
  const v = recentTelemetry.at(-1) ?? null

  const series = useMemo<SparklinePoint[]>(
    () => recentTelemetry.map((t) => ({ ts: t.lastPacketAt, value: t.motorCurrent })),
    [recentTelemetry],
  )

  return (
    <TelemetryCard
      controlId="motor-current"
      label="Motor Current"
      value={v ? fmt(v.motorCurrent) : DASH}
      unit={v ? 'A' : undefined}
      series={series}
      seriesColor={theme.bran.color}
      fmtMax={FMT_MAX}
      minSpan={MIN_SPAN}
    />
  )
}
