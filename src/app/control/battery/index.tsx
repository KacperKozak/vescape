import { useMemo } from 'react'
import { StyleSheet, Text } from 'react-native'

import { computeAutoRange } from '@/components/ui/charts/chartMath'
import { ControlDetailLayout } from '@/components/domain/control/ControlDetailLayout'
import { MetricDetailChart } from '@/components/domain/control/MetricDetailChart'
import { MetricDetailGauge } from '@/components/domain/control/MetricDetailGauge'
import { toTelemetryChartPoints } from '@/components/domain/control/metricDetailData'
import { telemetry } from '@/constants/telemetry'
import { deriveBatteryConfig } from '@/lib/battery'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useBoardStore } from '@/store/boardStore'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/lib/telemetry/liveTelemetryRuntime'
import { theme } from '@/constants/theme'

const battVoltageCfg = telemetry.battVoltage
const battPercentCfg = { ...battVoltageCfg, unit: '%', decimals: 0, label: 'BATTERY' }
const formatPercent = (value: number) => `${Math.round(value)}%`
const formatVoltage = battVoltageCfg.formatWithUnit

const PERCENT_RANGE = { y: { min: 0, max: 100 } }
/** Battery % is the main (green) line; voltage rides under it as a dim, de-emphasized gray. */
const VOLTAGE_LINE_COLOR = theme.neutral.textMuted

export default function BatteryScreen() {
  const batteryVoltage = useLiveMetric(liveSelectors.batteryVoltage)
  const batteryPercent = useLiveMetric(liveSelectors.batteryPercent)
  const windowMs = useLiveWindowMs()
  const board = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))

  const voltagePoints = useMemo(() => toTelemetryChartPoints(batteryVoltage), [batteryVoltage])
  const percentPoints = useMemo(() => toTelemetryChartPoints(batteryPercent), [batteryPercent])
  const battery = useMemo(
    () => deriveBatteryConfig(board?.batteryConfig ?? null),
    [board?.batteryConfig],
  )

  const configured = battery.warning == null
  const voltageRange = useMemo(() => {
    if (configured) return { y: { min: battery.minVoltage, max: battery.maxVoltage } }
    return computeAutoRange(voltagePoints, { minSpan: battVoltageCfg.minSpan })
  }, [configured, battery, voltagePoints])

  // When configured, plot % as the main line (left axis) with voltage underneath (right axis).
  // Without a pack config there is no %, so fall back to voltage as the only line.
  const voltageSecondary = useMemo(
    () => ({
      points: voltagePoints,
      range: voltageRange,
      color: VOLTAGE_LINE_COLOR,
      formatValue: formatVoltage,
    }),
    [voltagePoints, voltageRange],
  )

  return (
    <ControlDetailLayout
      title={battVoltageCfg.label}
      controlId={battVoltageCfg.controlId}
      unit={battVoltageCfg.unit}
    >
      {!configured ? (
        <Text style={styles.unconfigured}>
          Set battery config in board settings for pack range.
        </Text>
      ) : null}
      <MetricDetailGauge
        metric={configured ? battPercentCfg : battVoltageCfg}
        value={
          configured
            ? liveTelemetryRuntime.values.batteryPercent
            : liveTelemetryRuntime.values.batteryVoltage
        }
        min={configured ? 0 : voltageRange.y.min}
        max={configured ? 100 : voltageRange.y.max}
      />
      {configured ? (
        <MetricDetailChart
          metric={battVoltageCfg}
          label="BATTERY %"
          points={percentPoints}
          range={PERCENT_RANGE}
          formatValue={formatPercent}
          windowMs={windowMs}
          secondary={voltageSecondary}
        />
      ) : (
        <MetricDetailChart
          metric={battVoltageCfg}
          points={voltagePoints}
          range={voltageRange}
          windowMs={windowMs}
        />
      )}
    </ControlDetailLayout>
  )
}

const styles = StyleSheet.create({
  unconfigured: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
})
