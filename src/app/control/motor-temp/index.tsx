import { useMemo } from 'react'

import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/modules/board/components/ControlDetailLayout'
import { MetricDetailChart } from '@/modules/board/components/MetricDetailChart'
import { MetricPresetGauge } from '@/modules/board/components/MetricPresetGauge'
import { toTelemetryChartPoints } from '@/modules/board/components/metricDetailData'
import { telemetry } from '@/modules/board/constants/telemetry'
import { liveSelectors, useLiveMetric } from '@/modules/board/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/modules/settings/store/settingsStore'
import { liveTelemetryRuntime } from '@/modules/board/lib/liveTelemetryRuntime'

const cfg = telemetry.motorTemp

export default function MotorTempScreen() {
  const motorTemp = useLiveMetric(liveSelectors.motorTemp)
  const windowMs = useLiveWindowMs()
  const points = useMemo(() => toTelemetryChartPoints(motorTemp), [motorTemp])
  const range = useMemo(() => computeAutoRange(points, { baseline: cfg.chartRange }), [points])

  return (
    <ControlDetailLayout
      title="Motor Temperature"
      controlId={cfg.controlId!}
      unit={cfg.unit}
      gauge={
        <MetricPresetGauge metric="motor-temp" value={liveTelemetryRuntime.values.motorTemp} />
      }
    >
      <MetricDetailChart metric={cfg} points={points} range={range} windowMs={windowMs} />
    </ControlDetailLayout>
  )
}
