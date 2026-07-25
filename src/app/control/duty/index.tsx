import { useMemo } from 'react'

import { ControlDetailLayout } from '@/modules/board/components/ControlDetailLayout'
import { MetricDetailChart } from '@/modules/board/components/MetricDetailChart'
import { toTelemetryChartPoints } from '@/modules/board/components/metricDetailData'
import { telemetry } from '@/modules/board/constants/telemetry'
import {
  useLiveMetric,
  useLiveExcludedRanges,
  liveSelectors,
} from '@/modules/board/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/modules/settings/store/settingsStore'
import { liveTelemetryRuntime } from '@/modules/board/lib/liveTelemetryRuntime'

const cfg = telemetry.duty
const RANGE = { y: cfg.chartRange }

export default function DutyScreen() {
  const duty = useLiveMetric(liveSelectors.duty)
  const windowMs = useLiveWindowMs()
  const points = useMemo(() => toTelemetryChartPoints(duty), [duty])
  const excludedRanges = useLiveExcludedRanges('max_duty')

  return (
    <ControlDetailLayout
      title={cfg.label}
      controlId={cfg.controlId}
      unit={cfg.unit}
      liveValue={liveTelemetryRuntime.values.dutyPercent}
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
