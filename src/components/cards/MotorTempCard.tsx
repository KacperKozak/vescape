import { useMemo } from 'react'

import { type SparklinePoint } from '@/components/charts/Sparkline'
import { TelemetryCard } from '@/components/TelemetryCard'
import { theme } from '@/constants/theme'
import { DASH, fmt } from '@/helpers/format'
import { useBleStore } from '@/store/bleStore'
import { useLiveWindowMs } from '@/store/settingsStore'

const FMT_MAX = (v: number) => `${v.toFixed(0)}°C`
const MIN_SPAN = 30

export function MotorTempCard() {
  const recentTelemetry = useBleStore((s) => s.recentTelemetry)
  const windowMs = useLiveWindowMs()
  const v = recentTelemetry.at(-1) ?? null

  // Refloat reports tempMotor=0 when sensor is unwired/disabled — treat as no reading.
  const motorTemp = v?.tempMotor != null && v.tempMotor > 0 ? v.tempMotor : null

  const series = useMemo<SparklinePoint[]>(
    () =>
      recentTelemetry.flatMap((t) =>
        t.tempMotor != null && t.tempMotor > 0 ? [{ ts: t.lastPacketAt, value: t.tempMotor }] : [],
      ),
    [recentTelemetry],
  )

  return (
    <TelemetryCard
      controlId="motor-temp"
      label="Motor Temp"
      value={motorTemp != null ? fmt(motorTemp) : DASH}
      unit={motorTemp != null ? '°C' : undefined}
      series={series}
      seriesColor={theme.warning.color}
      fmtMax={FMT_MAX}
      minSpan={MIN_SPAN}
      windowMs={windowMs}
    />
  )
}
