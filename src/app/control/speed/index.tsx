import { useMemo } from 'react'

import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { MetricDetailChart } from '@/components/control/MetricDetailChart'
import { toTelemetryChartPoints } from '@/components/control/metricDetailData'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const cfg = telemetry.speed
const RANGE = { y: cfg.chartRange }

export default function SpeedScreen() {
  const speed = useLiveMetric(liveSelectors.speed)
  const windowMs = useLiveWindowMs()
  const points = useMemo(() => toTelemetryChartPoints(speed), [speed])

  return (
    <ControlDetailLayout title={cfg.label} controlId={cfg.controlId} unit={cfg.unit}>
      <MetricDetailChart metric={cfg} points={points} range={RANGE} windowMs={windowMs} />
    </ControlDetailLayout>
  )
}
