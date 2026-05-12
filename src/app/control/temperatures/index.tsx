import { useMemo } from 'react'

import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { MetricDetailChart } from '@/components/control/MetricDetailChart'
import { toTelemetryChartPoints } from '@/components/control/metricDetailData'
import { telemetry } from '@/constants/telemetry'
import { liveSelectors, useLiveMetric } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const motor = telemetry.motorTemp
const controller = telemetry.controllerTemp

export default function TemperaturesScreen() {
  const motorTemp = useLiveMetric(liveSelectors.motorTemp)
  const controllerTemp = useLiveMetric(liveSelectors.controllerTemp)
  const windowMs = useLiveWindowMs()

  const motorPoints = useMemo(() => toTelemetryChartPoints(motorTemp), [motorTemp])
  const controllerPoints = useMemo(() => toTelemetryChartPoints(controllerTemp), [controllerTemp])

  const motorRange = useMemo(
    () => computeAutoRange(motorPoints, { baseline: motor.chartRange }),
    [motorPoints],
  )
  const controllerRange = useMemo(
    () => computeAutoRange(controllerPoints, { baseline: controller.chartRange }),
    [controllerPoints],
  )

  return (
    <ControlDetailLayout
      title="Temperatures"
      alertControls={[
        { label: motor.label, controlId: motor.controlId!, unit: motor.unit },
        { label: controller.label, controlId: controller.controlId!, unit: controller.unit },
      ]}
    >
      <MetricDetailChart
        metric={motor}
        points={motorPoints}
        range={motorRange}
        windowMs={windowMs}
      />
      <MetricDetailChart
        metric={controller}
        points={controllerPoints}
        range={controllerRange}
        windowMs={windowMs}
      />
    </ControlDetailLayout>
  )
}
