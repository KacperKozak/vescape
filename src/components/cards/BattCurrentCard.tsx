import { TelemetryCard } from '@/components/TelemetryCard'
import { theme } from '@/constants/theme'
import { DASH, fmtCurrent } from '@/helpers/format'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const FMT_MAX = (v: number) => `${fmtCurrent(v)} A`
const MIN_SPAN = 20

export function BattCurrentCard() {
  const series = useLiveMetric(liveSelectors.batteryCurrent)
  const windowMs = useLiveWindowMs()

  return (
    <TelemetryCard
      controlId="batt-current"
      label="Batt Current"
      value={DASH}
      unit="A"
      animatedValue={liveTelemetryRuntime.values.batteryCurrent}
      animatedDecimals={0}
      series={series}
      seriesColor={theme.gps.color}
      fmtMax={FMT_MAX}
      minSpan={MIN_SPAN}
      windowMs={windowMs}
    />
  )
}
