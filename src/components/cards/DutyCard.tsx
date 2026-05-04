import { useMemo } from 'react'

import { type SparklinePoint } from '@/components/charts/Sparkline'
import { TelemetryCard } from '@/components/TelemetryCard'
import { theme } from '@/constants/theme'
import { DASH } from '@/helpers/format'
import { useBleStore } from '@/store/bleStore'

const FMT_MAX = (v: number) => `${v.toFixed(0)}%`
const RANGE = { min: 0, max: 100 }

export function DutyCard() {
  const recentTelemetry = useBleStore((s) => s.recentTelemetry)
  const v = recentTelemetry.at(-1) ?? null

  const series = useMemo<SparklinePoint[]>(
    () => recentTelemetry.map((t) => ({ ts: t.lastPacketAt, value: Math.abs(t.dutyCycle) * 100 })),
    [recentTelemetry],
  )

  return (
    <TelemetryCard
      label="Duty Cycle"
      value={v ? (Math.abs(v.dutyCycle) * 100).toFixed(1) : DASH}
      unit={v ? '%' : undefined}
      series={series}
      seriesColor={theme.bran.color}
      fmtMax={FMT_MAX}
      range={RANGE}
    />
  )
}
