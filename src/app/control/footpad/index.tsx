import { useMemo } from 'react'

import { computeAutoRange } from '@/components/ui/charts/chartMath'
import { ControlDetailLayout } from '@/components/domain/control/ControlDetailLayout'
import { MetricDetailChart } from '@/components/domain/control/MetricDetailChart'
import { toTelemetryChartPoints } from '@/components/domain/control/metricDetailData'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const adc1 = telemetry.footpadAdc1
const adc2 = telemetry.footpadAdc2

export default function FootpadScreen() {
  const adc1Data = useLiveMetric(liveSelectors.footpadAdc1)
  const adc2Data = useLiveMetric(liveSelectors.footpadAdc2)
  const windowMs = useLiveWindowMs()

  const adc1Points = useMemo(() => toTelemetryChartPoints(adc1Data), [adc1Data])

  const adc2Points = useMemo(() => toTelemetryChartPoints(adc2Data), [adc2Data])

  const adc1Range = useMemo(
    () => computeAutoRange(adc1Points, { baseline: adc1.chartRange }),
    [adc1Points],
  )
  const adc2Range = useMemo(
    () => computeAutoRange(adc2Points, { baseline: adc2.chartRange }),
    [adc2Points],
  )

  return (
    <ControlDetailLayout title="Footpad">
      <MetricDetailChart
        metric={adc1}
        points={adc1Points}
        range={adc1Range}
        height={80}
        formatValue={adc1.format}
        windowMs={windowMs}
      />

      <MetricDetailChart
        metric={adc2}
        points={adc2Points}
        range={adc2Range}
        height={80}
        formatValue={adc2.format}
        windowMs={windowMs}
      />
    </ControlDetailLayout>
  )
}
