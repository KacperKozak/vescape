import { TelemetryCard } from '@/components/TelemetryCard'
import { telemetry } from '@/constants/telemetry'
import { DASH } from '@/helpers/format'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const cfg = telemetry.duty
const FMT_MAX = (v: number) => cfg.formatWithUnit(v)
const RANGE = cfg.chartRange

export function DutyCard() {
  const series = useLiveMetric(liveSelectors.duty)
  const windowMs = useLiveWindowMs()

  return (
    <TelemetryCard
      controlId={cfg.controlId}
      label={cfg.label}
      value={DASH}
      unit={cfg.unit}
      animatedValue={liveTelemetryRuntime.values.dutyPercent}
      animatedDecimals={cfg.decimals}
      series={series}
      seriesColor={cfg.color}
      fmtMax={FMT_MAX}
      range={RANGE}
      windowMs={windowMs}
    />
  )
}
