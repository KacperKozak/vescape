import { useMemo } from 'react'

import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/modules/board/components/ControlDetailLayout'
import { MetricDetailChart } from '@/modules/board/components/MetricDetailChart'
import { toTelemetryChartPoints } from '@/modules/board/components/metricDetailData'
import { telemetry } from '@/modules/board/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/modules/board/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/modules/settings/store/settingsStore'

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
        label={adc1.label}
        points={adc1Points}
        range={adc1Range}
        height={80}
        formatValue={adc1.format}
        windowMs={windowMs}
      />

      <MetricDetailChart
        metric={adc2}
        label={adc2.label}
        points={adc2Points}
        range={adc2Range}
        height={80}
        formatValue={adc2.format}
        windowMs={windowMs}
      />
    </ControlDetailLayout>
  )
}
