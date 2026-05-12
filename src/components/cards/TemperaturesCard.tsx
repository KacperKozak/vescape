import { DualMetricCard } from '@/components/cards/DualMetricCard'
import { telemetry } from '@/constants/telemetry'
import { liveSelectors, useLiveMetric } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

export function TemperaturesCard() {
  const motor = telemetry.motorTemp
  const controller = telemetry.controllerTemp
  const motorSeries = useLiveMetric(liveSelectors.motorTemp)
  const controllerSeries = useLiveMetric(liveSelectors.controllerTemp)
  const windowMs = useLiveWindowMs()
  const latestMotor = motorSeries.at(-1)
  const latestController = controllerSeries.at(-1)

  return (
    <DualMetricCard
      title="Temperatures"
      left={{
        metric: motor,
        label: 'Motor',
        value: latestMotor?.value ?? null,
        series: motorSeries,
        windowMs,
      }}
      right={{
        metric: controller,
        label: 'Controller',
        value: latestController?.value ?? null,
        series: controllerSeries,
        windowMs,
      }}
    />
  )
}
