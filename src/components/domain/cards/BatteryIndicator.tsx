import { useMemo } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { useRouter } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'

import { LinearGauge } from '@/components/ui/charts/LinearGauge'
import { type DualGaugeAlert } from '@/components/ui/charts/DualGauge'
import { telemetry } from '@/constants/telemetry'
import { TELEMETRY_THRESHOLDS } from '@/constants/telemetryThresholds'
import { theme } from '@/constants/theme'
import { deriveBatteryConfig } from '@/lib/battery'
import { useLiveSeries } from '@/hooks/useLiveMetric'
import { useAlertsStore } from '@/store/alertsStore'
import { useBoardStore } from '@/store/boardStore'
import { routes } from '@/navigation/routes'

interface BatteryIndicatorProps {
  compact?: boolean
  transparent?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

/** Warning shade when low on charge, else the battery metric color. Mirrors the gauge fill.
 *  Threshold sourced from the shared telemetry thresholds (battery.warning is a
 *  0-1 fraction; battery percent is 0-100). */
function pickColor(percent: number | null): string {
  if (percent != null && percent < TELEMETRY_THRESHOLDS.battery.warning * 100) {
    return theme.status.warning.color
  }
  return telemetry.battVoltage.color
}

export function BatteryIndicator({ compact, transparent, containerStyle }: BatteryIndicatorProps) {
  const router = useRouter()
  // Decimated series (native, ~1Hz). Battery is a slow signal, so the series cadence both
  // supplies the latest SoC/voltage sample and paces this component's re-render.
  const batterySeries = useLiveSeries('batteryPercent')
  const voltageSeries = useLiveSeries('batteryVoltage')
  const { batteryConfig, hasBoard } = useBoardStore(
    useShallow((s) => {
      const board = s.boards.find((b) => b.id === s.activeBoardId)
      return { batteryConfig: board?.batteryConfig ?? null, hasBoard: board != null }
    }),
  )
  const alertRules = useAlertsStore((s) => s.rules)

  // Config gates whether a SoC reading exists at all (voltage limits set).
  const batteryConfigured = useMemo(
    () => deriveBatteryConfig(batteryConfig).warning == null,
    [batteryConfig],
  )

  // Battery alert thresholds are percent-scaled, so they only map onto the 0–100 bar once a
  // pack config exists. Hide them (and show the hint) until then.
  const alerts = useMemo<DualGaugeAlert[]>(
    () =>
      batteryConfigured
        ? alertRules
            .filter((rule) => rule.enabled && rule.controlId === 'battery')
            .map((rule) => ({
              id: rule.id,
              threshold: rule.threshold,
              thresholdMax: rule.thresholdMax,
            }))
        : [],
    [alertRules, batteryConfigured],
  )

  const percent = batteryConfigured ? (batterySeries.at(-1)?.value ?? null) : null
  const voltage = voltageSeries.at(-1)?.value ?? null

  return (
    <LinearGauge
      value={percent}
      max={100}
      color={pickColor(percent)}
      unit="%"
      alerts={alerts}
      aux={voltage != null ? telemetry.battVoltage.formatWithUnit(voltage) : undefined}
      hint={!batteryConfigured && hasBoard ? 'Set battery config in board settings' : undefined}
      compact={compact}
      transparent={transparent}
      containerStyle={containerStyle}
      onPress={() => router.push(hasBoard ? routes.controlBattery : routes.addBoard)}
      testID="battery-bar"
    />
  )
}
