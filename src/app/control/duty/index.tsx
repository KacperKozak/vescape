import { useMemo } from 'react'

import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { MetricDetailChart } from '@/components/control/MetricDetailChart'
import { MetricDetailGauge } from '@/components/control/MetricDetailGauge'
import { toTelemetryChartPoints } from '@/components/control/metricDetailData'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const cfg = telemetry.duty
const RANGE = { y: cfg.chartRange }

export default function DutyScreen() {
  const duty = useLiveMetric(liveSelectors.duty)
  const windowMs = useLiveWindowMs()
  const points = useMemo(() => toTelemetryChartPoints(duty), [duty])

  return (
    <ControlDetailLayout title={cfg.label} controlId={cfg.controlId} unit={cfg.unit}>
      <MetricDetailGauge metric={cfg} value={liveTelemetryRuntime.values.dutyPercent} />
      <MetricDetailChart metric={cfg} points={points} range={RANGE} windowMs={windowMs} />
    </ControlDetailLayout>
  )
}
