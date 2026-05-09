import { useMemo } from 'react'

import { type SparklinePoint } from '@/components/charts/Sparkline'
import { TelemetryCard } from '@/components/TelemetryCard'
import { theme } from '@/constants/theme'
import { DASH, dutyPercent } from '@/helpers/format'
import { useBleStore } from '@/store/bleStore'
import { useLiveWindowMs } from '@/store/settingsStore'

const FMT_MAX = (v: number) => `${v.toFixed(0)}%`
const RANGE = { min: 0, max: 100 }

export function DutyCard() {
  const recentTelemetry = useBleStore((s) => s.recentTelemetry)
  const windowMs = useLiveWindowMs()
  const v = recentTelemetry.at(-1) ?? null

  const series = useMemo<SparklinePoint[]>(
    () => recentTelemetry.map((t) => ({ ts: t.lastPacketAt, value: dutyPercent(t.dutyCycle) })),
    [recentTelemetry],
  )

  return (
    <TelemetryCard
      controlId="duty"
      label="Duty Cycle"
      value={v ? dutyPercent(v.dutyCycle).toFixed(0) : DASH}
      unit={v ? '%' : undefined}
      series={series}
      seriesColor={theme.bran.color}
      fmtMax={FMT_MAX}
      range={RANGE}
      windowMs={windowMs}
    />
  )
}
