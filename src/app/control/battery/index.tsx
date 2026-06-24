import { useEffect, useMemo } from 'react'
import { useSharedValue } from 'react-native-reanimated'

import { BmsCellVoltages } from '@/components/domain/control/BmsCellVoltages'
import { ControlDetailLayout } from '@/components/domain/control/ControlDetailLayout'
import { MetricDetailChart } from '@/components/domain/control/MetricDetailChart'
import { MetricDetailGauge } from '@/components/domain/control/MetricDetailGauge'
import { toTelemetryChartPoints } from '@/components/domain/control/metricDetailData'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const battVoltageCfg = telemetry.battVoltage
const battPercentCfg = { ...battVoltageCfg, unit: '%', decimals: 0 }
const formatPercent = (value: number) => `${Math.round(value)}%`

const PERCENT_RANGE = { y: { min: 0, max: 100 } }

export default function BatteryScreen() {
  const batteryPercent = useLiveMetric(liveSelectors.batteryPercent)
  const windowMs = useLiveWindowMs()

  const percentPoints = useMemo(() => toTelemetryChartPoints(batteryPercent), [batteryPercent])

  // Gauge reads the latest of the calm ~1Hz decimated series — the same SoC source/cadence the
  // center BatteryIndicator uses. The per-frame `liveTelemetryRuntime` tick carries the identical
  // smoothed estimate but updates every BLE frame, which made the big % readout jitter.
  const latestPercent = batteryPercent.at(-1)?.value ?? null
  const percentValue = useSharedValue<number | null>(latestPercent)
  useEffect(() => {
    percentValue.value = latestPercent
  }, [latestPercent, percentValue])

  return (
    <ControlDetailLayout
      title="Battery"
      controlId={battVoltageCfg.controlId}
      unit={battVoltageCfg.unit}
      gauge={<MetricDetailGauge metric={battPercentCfg} value={percentValue} min={0} max={100} />}
    >
      <MetricDetailChart
        metric={battPercentCfg}
        points={percentPoints}
        range={PERCENT_RANGE}
        formatValue={formatPercent}
        windowMs={windowMs}
      />
      <BmsCellVoltages />
    </ControlDetailLayout>
  )
}
