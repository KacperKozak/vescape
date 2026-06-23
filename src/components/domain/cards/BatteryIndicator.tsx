import { useMemo } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { useRouter } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'

import { BatteryBar } from '@/components/ui/base/BatteryBar'
import { deriveBatteryConfig } from '@/lib/battery'
import { useLiveSeries } from '@/hooks/useLiveMetric'
import { useBoardStore } from '@/store/boardStore'
import { useLiveWindowMs } from '@/store/settingsStore'
import { routes } from '@/navigation/routes'

interface BatteryIndicatorProps {
  compact?: boolean
  transparent?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

export function BatteryIndicator({ compact, transparent, containerStyle }: BatteryIndicatorProps) {
  const router = useRouter()
  // Decimated sparkline series (native, ~1Hz). Plots the median-smoothed SoC Estimate
  // (ADR-0016) over 0–100 so the line matches the % readout and the detail screen,
  // instead of raw pack voltage which sags sharply under load. The series publish also
  // paces this component's re-render, at which point the live numbers are sampled off
  // the 31Hz tick.
  const batterySeries = useLiveSeries('batteryPercent')
  const voltageSeries = useLiveSeries('batteryVoltage')
  const windowMs = useLiveWindowMs()
  const batteryConfig = useBoardStore(
    useShallow((s) => {
      const board = s.boards.find((b) => b.id === s.activeBoardId)
      return board?.batteryConfig ?? null
    }),
  )

  // Config gates whether a SoC reading exists at all (voltage limits set).
  const batteryConfigured = useMemo(
    () => deriveBatteryConfig(batteryConfig).warning == null,
    [batteryConfig],
  )

  // Latest decimated sample (~1Hz). Battery is a slow signal, so the series cadence is
  // plenty — and reading it here avoids touching a Reanimated SharedValue during render.
  const percent = batterySeries.at(-1)?.value ?? null
  const voltage = voltageSeries.at(-1)?.value ?? null

  return (
    <BatteryBar
      percent={batteryConfigured ? percent : null}
      voltage={voltage}
      series={batterySeries}
      windowMs={windowMs}
      hint={!batteryConfigured ? 'Set battery config in board settings' : undefined}
      compact={compact}
      transparent={transparent}
      containerStyle={containerStyle}
      onPress={() => router.push(routes.controlBattery)}
    />
  )
}
