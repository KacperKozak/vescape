import { useMemo } from 'react'

import { type SparklinePoint } from '@/components/charts/Sparkline'
import { TelemetryCard } from '@/components/TelemetryCard'
import { theme } from '@/constants/theme'
import { DASH, fmt } from '@/helpers/format'
import { useBleStore } from '@/store/bleStore'
import { useLiveWindowMs } from '@/store/settingsStore'

const FMT_MAX = (v: number) => `${v.toFixed(0)}°C`
const MIN_SPAN = 30

export function ControllerTempCard() {
  const recentTelemetry = useBleStore((s) => s.recentTelemetry)
  const windowMs = useLiveWindowMs()
  const v = recentTelemetry.at(-1) ?? null

  const series = useMemo<SparklinePoint[]>(
    () =>
      recentTelemetry.flatMap((t) =>
        t.tempMosfet != null ? [{ ts: t.lastPacketAt, value: t.tempMosfet }] : [],
      ),
    [recentTelemetry],
  )

  return (
    <TelemetryCard
      controlId="controller-temp"
      label="Controller Temp"
      value={v?.tempMosfet != null ? fmt(v.tempMosfet) : DASH}
      unit={v?.tempMosfet != null ? '°C' : undefined}
      series={series}
      seriesColor={theme.warning.color}
      fmtMax={FMT_MAX}
      minSpan={MIN_SPAN}
      windowMs={windowMs}
    />
  )
}
