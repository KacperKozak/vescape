import { TelemetryCard } from '@/components/TelemetryCard'
import { theme } from '@/constants/theme'
import { DASH, fmtTemp } from '@/helpers/format'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const FMT_MAX = (v: number) => `${fmtTemp(v)}°C`
const MIN_SPAN = 30

export function MotorTempCard() {
  const series = useLiveMetric(liveSelectors.motorTemp)
  const windowMs = useLiveWindowMs()

  return (
    <TelemetryCard
      controlId="motor-temp"
      label="Motor Temp"
      value={DASH}
      unit="°C"
      animatedValue={liveTelemetryRuntime.values.motorTemp}
      animatedDecimals={0}
      series={series}
      seriesColor={theme.warning.color}
      fmtMax={FMT_MAX}
      minSpan={MIN_SPAN}
      windowMs={windowMs}
    />
  )
}
