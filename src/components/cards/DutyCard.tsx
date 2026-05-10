import { TelemetryCard } from '@/components/TelemetryCard'
import { theme } from '@/constants/theme'
import { DASH } from '@/helpers/format'
import { useBleStore } from '@/store/bleStore'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const FMT_MAX = (v: number) => `${v.toFixed(0)}%`
const RANGE = { min: 0, max: 100 }

export function DutyCard() {
  const series = useBleStore((s) => s.liveMetricHistory.duty)
  const windowMs = useLiveWindowMs()

  return (
    <TelemetryCard
      controlId="duty"
      label="Duty Cycle"
      value={DASH}
      unit="%"
      animatedValue={liveTelemetryRuntime.values.dutyPercent}
      animatedDecimals={0}
      series={series}
      seriesColor={theme.bran.color}
      fmtMax={FMT_MAX}
      range={RANGE}
      windowMs={windowMs}
    />
  )
}
