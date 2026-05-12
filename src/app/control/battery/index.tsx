import { useMemo } from 'react'

import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { MetricDetailChart } from '@/components/control/MetricDetailChart'
import { toTelemetryChartPoints } from '@/components/control/metricDetailData'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useBoardStore } from '@/store/boardStore'
import { useLiveWindowMs } from '@/store/settingsStore'

const cfg = telemetry.battVoltage

export default function BatteryScreen() {
  const batteryVoltage = useLiveMetric(liveSelectors.batteryVoltage)
  const windowMs = useLiveWindowMs()
  const board = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))

  const points = useMemo(() => toTelemetryChartPoints(batteryVoltage), [batteryVoltage])

  const range = useMemo(() => {
    if (board?.minVoltage != null && board?.maxVoltage != null) {
      return { y: { min: board.minVoltage, max: board.maxVoltage } }
    }
    return computeAutoRange(points, { minSpan: cfg.minSpan })
  }, [board?.minVoltage, board?.maxVoltage, points])

  return (
    <ControlDetailLayout title={cfg.label} controlId={cfg.controlId} unit={cfg.unit}>
      <MetricDetailChart metric={cfg} points={points} range={range} windowMs={windowMs} />
    </ControlDetailLayout>
  )
}
