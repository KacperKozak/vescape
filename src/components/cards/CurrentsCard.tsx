import { DualMetricCard } from '@/components/cards/DualMetricCard'
import { telemetry } from '@/constants/telemetry'
import { liveSelectors, useLiveMetric } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

export function CurrentsCard() {
  const motor = telemetry.motorCurrent
  const battery = telemetry.battCurrent
  const motorSeries = useLiveMetric(liveSelectors.motorCurrent)
  const batterySeries = useLiveMetric(liveSelectors.batteryCurrent)
  const windowMs = useLiveWindowMs()
  const latestMotor = motorSeries.at(-1)
  const latestBattery = batterySeries.at(-1)

  return (
    <DualMetricCard
      title="Currents"
      left={{
        metric: motor,
        label: 'Motor',
        value: latestMotor?.value ?? null,
        series: motorSeries,
        windowMs,
      }}
      right={{
        metric: battery,
        label: 'Battery',
        value: latestBattery?.value ?? null,
        series: batterySeries,
        windowMs,
      }}
    />
  )
}
