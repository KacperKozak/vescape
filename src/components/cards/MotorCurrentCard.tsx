import { TelemetryCard } from '@/components/TelemetryCard'
import { theme } from '@/constants/theme'
import { DASH, fmt } from '@/helpers/format'
import { useBleStore } from '@/store/bleStore'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const FMT_MAX = (v: number) => `${v.toFixed(0)} A`
const MIN_SPAN = 20

export function MotorCurrentCard() {
  const series = useBleStore((s) => s.liveMetricHistory.motorCurrent)
  const windowMs = useLiveWindowMs()

  return (
    <TelemetryCard
      controlId="motor-current"
      label="Motor Current"
      value={DASH}
      unit="A"
      animatedValue={liveTelemetryRuntime.values.motorCurrent}
      formatAnimatedValue={fmt}
      series={series}
      seriesColor={theme.bran.color}
      fmtMax={FMT_MAX}
      minSpan={MIN_SPAN}
      windowMs={windowMs}
    />
  )
}
