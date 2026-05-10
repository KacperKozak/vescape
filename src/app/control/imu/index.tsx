import { useState, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { CHART_DEFAULTS } from '@/constants/chartDefaults'
import { DASH, fmt } from '@/helpers/format'
import { theme } from '@/constants/theme'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

export default function ImuScreen() {
  const pitch = useLiveMetric(liveSelectors.pitch)
  const roll = useLiveMetric(liveSelectors.roll)
  const balancePitch = useLiveMetric(liveSelectors.balancePitch)
  const windowMs = useLiveWindowMs()

  const pitchPoints = useMemo<TelemetryChartPoint[]>(
    () => pitch.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [pitch],
  )

  const rollPoints = useMemo<TelemetryChartPoint[]>(
    () => roll.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [roll],
  )

  const balancePoints = useMemo<TelemetryChartPoint[]>(
    () => balancePitch.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [balancePitch],
  )

  const pitchRange = useMemo(
    () => computeAutoRange(pitchPoints, { baseline: CHART_DEFAULTS.pitch }),
    [pitchPoints],
  )
  const rollRange = useMemo(
    () => computeAutoRange(rollPoints, { baseline: CHART_DEFAULTS.roll }),
    [rollPoints],
  )
  const balanceRange = useMemo(
    () => computeAutoRange(balancePoints, { baseline: CHART_DEFAULTS.balance }),
    [balancePoints],
  )

  const [selectedPitch, setSelectedPitch] = useState<TelemetryChartPoint | null>(null)
  const [selectedRoll, setSelectedRoll] = useState<TelemetryChartPoint | null>(null)
  const [selectedBalance, setSelectedBalance] = useState<TelemetryChartPoint | null>(null)

  const currentPitch = selectedPitch ?? pitchPoints.at(-1) ?? null
  const currentRoll = selectedRoll ?? rollPoints.at(-1) ?? null
  const currentBalance = selectedBalance ?? balancePoints.at(-1) ?? null

  return (
    <ControlDetailLayout title="IMU">
      <View style={styles.liveRow}>
        <View style={styles.liveCell}>
          <Text style={styles.liveLabel}>PITCH</Text>
          <Text style={styles.liveValue}>
            {pitchPoints.at(-1) ? `${fmt(pitchPoints.at(-1)!.value, 1)}°` : DASH}
          </Text>
        </View>
        <View style={styles.liveCell}>
          <Text style={styles.liveLabel}>ROLL</Text>
          <Text style={styles.liveValue}>
            {rollPoints.at(-1) ? `${fmt(rollPoints.at(-1)!.value, 1)}°` : DASH}
          </Text>
        </View>
        <View style={styles.liveCell}>
          <Text style={styles.liveLabel}>BAL</Text>
          <Text style={styles.liveValue}>
            {balancePoints.at(-1) ? `${fmt(balancePoints.at(-1)!.value, 1)}°` : DASH}
          </Text>
        </View>
      </View>

      <TelemetryLineChart
        label="PITCH"
        value={currentPitch ? `${fmt(currentPitch.value, 1)}°` : DASH}
        points={pitchPoints}
        currentPoint={currentPitch}
        color={theme.wheel.color}
        range={pitchRange}
        height={80}
        onPointSelected={setSelectedPitch}
        onGestureStart={() => setSelectedPitch(null)}
        formatValue={(v) => `${fmt(v, 1)}°`}
        windowMs={windowMs}
      />

      <TelemetryLineChart
        label="ROLL"
        value={currentRoll ? `${fmt(currentRoll.value, 1)}°` : DASH}
        points={rollPoints}
        currentPoint={currentRoll}
        color={theme.bran.color}
        range={rollRange}
        height={80}
        onPointSelected={setSelectedRoll}
        onGestureStart={() => setSelectedRoll(null)}
        formatValue={(v) => `${fmt(v, 1)}°`}
        windowMs={windowMs}
      />

      <TelemetryLineChart
        label="BALANCE PITCH"
        value={currentBalance ? `${fmt(currentBalance.value, 1)}°` : DASH}
        points={balancePoints}
        currentPoint={currentBalance}
        color={theme.target.color}
        range={balanceRange}
        height={80}
        onPointSelected={setSelectedBalance}
        onGestureStart={() => setSelectedBalance(null)}
        formatValue={(v) => `${fmt(v, 1)}°`}
        windowMs={windowMs}
      />
    </ControlDetailLayout>
  )
}

const styles = StyleSheet.create({
  liveRow: {
    flexDirection: 'row',
    gap: 8,
  },
  liveCell: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  liveLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  liveValue: {
    color: '#f1f5f9',
    fontSize: 20,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
})
