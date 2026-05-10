import { TelemetryCard } from '@/components/TelemetryCard'
import { theme } from '@/constants/theme'
import { DASH } from '@/helpers/format'
import { useBleStore } from '@/store/bleStore'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const FMT_MAX = (v: number) => `${v.toFixed(0)}°C`
const MIN_SPAN = 30

export function ControllerTempCard() {
  const series = useBleStore((s) => s.liveMetricHistory.controllerTemp)
  const windowMs = useLiveWindowMs()

  return (
    <TelemetryCard
      controlId="controller-temp"
      label="Controller Temp"
      value={DASH}
      unit="°C"
      animatedValue={liveTelemetryRuntime.values.controllerTemp}
      animatedDecimals={1}
      series={series}
      seriesColor={theme.warning.color}
      fmtMax={FMT_MAX}
      minSpan={MIN_SPAN}
      windowMs={windowMs}
    />
  )
}
