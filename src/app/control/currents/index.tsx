import { useMemo } from 'react'

import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { MetricDetailChart } from '@/components/control/MetricDetailChart'
import { toTelemetryChartPoints } from '@/components/control/metricDetailData'
import { telemetry } from '@/constants/telemetry'
import { liveSelectors, useLiveMetric } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const motor = telemetry.motorCurrent
const battery = telemetry.battCurrent

export default function CurrentsScreen() {
  const motorCurrent = useLiveMetric(liveSelectors.motorCurrent)
  const batteryCurrent = useLiveMetric(liveSelectors.batteryCurrent)
  const windowMs = useLiveWindowMs()

  const motorPoints = useMemo(() => toTelemetryChartPoints(motorCurrent), [motorCurrent])
  const batteryPoints = useMemo(() => toTelemetryChartPoints(batteryCurrent), [batteryCurrent])

  const motorRange = useMemo(
    () => computeAutoRange(motorPoints, { baseline: motor.chartRange }),
    [motorPoints],
  )
  const batteryRange = useMemo(
    () => computeAutoRange(batteryPoints, { baseline: battery.chartRange }),
    [batteryPoints],
  )

  return (
    <ControlDetailLayout
      title="Currents"
      alertControls={[
        { label: motor.label, controlId: motor.controlId!, unit: motor.unit },
        { label: battery.label, controlId: battery.controlId!, unit: battery.unit },
      ]}
    >
      <MetricDetailChart
        metric={motor}
        points={motorPoints}
        range={motorRange}
        windowMs={windowMs}
      />
      <MetricDetailChart
        metric={battery}
        points={batteryPoints}
        range={batteryRange}
        windowMs={windowMs}
      />
    </ControlDetailLayout>
  )
}
