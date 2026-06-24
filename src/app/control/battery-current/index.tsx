import { useMemo } from 'react'

import { computeAutoRange } from '@/components/ui/charts/chartMath'
import { ControlDetailLayout } from '@/components/domain/control/ControlDetailLayout'
import { MetricDetailChart } from '@/components/domain/control/MetricDetailChart'
import { MetricDetailGauge } from '@/components/domain/control/MetricDetailGauge'
import { toTelemetryChartPoints } from '@/components/domain/control/metricDetailData'
import { telemetry } from '@/constants/telemetry'
import { liveSelectors, useLiveMetric } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/lib/telemetry/liveTelemetryRuntime'

const cfg = telemetry.battCurrent

export default function BatteryCurrentScreen() {
  const batteryCurrent = useLiveMetric(liveSelectors.batteryCurrent)
  const windowMs = useLiveWindowMs()
  const points = useMemo(() => toTelemetryChartPoints(batteryCurrent), [batteryCurrent])
  const range = useMemo(() => computeAutoRange(points, { baseline: cfg.chartRange }), [points])

  return (
    <ControlDetailLayout
      title={cfg.label}
      controlId={cfg.controlId!}
      unit={cfg.unit}
      gauge={<MetricDetailGauge metric={cfg} value={liveTelemetryRuntime.values.batteryCurrent} />}
    >
      <MetricDetailChart metric={cfg} points={points} range={range} windowMs={windowMs} />
    </ControlDetailLayout>
  )
}
