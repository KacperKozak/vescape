import { useMemo } from 'react'

import { ControlDetailLayout } from '@/modules/board/components/ControlDetailLayout'
import { MetricDetailChart } from '@/modules/board/components/MetricDetailChart'
import { MetricPresetGauge } from '@/modules/board/components/MetricPresetGauge'
import { toTelemetryChartPoints } from '@/modules/board/components/metricDetailData'
import { telemetry } from '@/modules/board/constants/telemetry'
import {
  useLiveMetric,
  useLiveExcludedRanges,
  liveSelectors,
} from '@/modules/board/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/modules/settings/store/settingsStore'
import { liveTelemetryRuntime } from '@/modules/board/lib/liveTelemetryRuntime'

const cfg = telemetry.speed
const RANGE = { y: cfg.chartRange }

export default function SpeedScreen() {
  const speed = useLiveMetric(liveSelectors.speed)
  const windowMs = useLiveWindowMs()
  const points = useMemo(() => toTelemetryChartPoints(speed), [speed])
  const excludedRanges = useLiveExcludedRanges('avg_speed', 'max_speed')

  return (
    <ControlDetailLayout
      title={cfg.label}
      controlId={cfg.controlId}
      unit={cfg.unit}
      gauge={<MetricPresetGauge metric="speed" value={liveTelemetryRuntime.values.speedKmh} />}
    >
      <MetricDetailChart
        metric={cfg}
        points={points}
        range={RANGE}
        windowMs={windowMs}
        excludedRanges={excludedRanges}
      />
    </ControlDetailLayout>
  )
}
