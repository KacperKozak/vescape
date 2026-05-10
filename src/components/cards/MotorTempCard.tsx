import { TelemetryCard } from '@/components/TelemetryCard'
import { theme } from '@/constants/theme'
import { DASH, fmt } from '@/helpers/format'
import { useBleStore } from '@/store/bleStore'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const FMT_MAX = (v: number) => `${v.toFixed(0)}°C`
const MIN_SPAN = 30

export function MotorTempCard() {
  const series = useBleStore((s) => s.liveMetricHistory.motorTemp)
  const windowMs = useLiveWindowMs()

  return (
    <TelemetryCard
      controlId="motor-temp"
      label="Motor Temp"
      value={DASH}
      unit="°C"
      animatedValue={liveTelemetryRuntime.values.motorTemp}
      formatAnimatedValue={fmt}
      series={series}
      seriesColor={theme.warning.color}
      fmtMax={FMT_MAX}
      minSpan={MIN_SPAN}
      windowMs={windowMs}
    />
  )
}
