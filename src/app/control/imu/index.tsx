import Slider from '@react-native-community/slider'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { computeAutoRange } from '@/components/ui/charts/chartMath'
import { ControlDetailLayout } from '@/components/domain/control/ControlDetailLayout'
import { MetricDetailChart } from '@/components/domain/control/MetricDetailChart'
import { toTelemetryChartPoints } from '@/components/domain/control/metricDetailData'
import { DASH } from '@/helpers/format'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'
import { useBleStore } from '@/store/bleStore'
import { theme } from '@/constants/theme'
import { setRemoteTilt, stopRemoteTilt } from 'vesc-ble'

const pitchCfg = telemetry.pitch
const rollCfg = telemetry.roll
const balanceCfg = telemetry.balancePitch

function latestValue(points: { value: number }[]) {
  return points.at(-1)?.value ?? null
}

function rotationDeg(value: number | null) {
  return value ?? 0
}

interface AttitudeViewProps {
  title: string
  value: string
  children: ReactNode
}

function AttitudeView({ title, value, children }: AttitudeViewProps) {
  return (
    <View style={styles.attitudeView}>
      <View style={styles.attitudeHeader}>
        <Text style={styles.attitudeTitle}>{title}</Text>
        <Text style={styles.attitudeValue}>{value}</Text>
      </View>
      <View style={styles.attitudeCanvas}>{children}</View>
    </View>
  )
}

interface ZeroLevelMarkerProps {
  color: string
}

function ZeroLevelMarker({ color }: ZeroLevelMarkerProps) {
  return (
    <View pointerEvents="none" style={styles.zeroLevelMarker}>
      <View style={styles.zeroTick} />
      <View style={[styles.zeroRing, { backgroundColor: color }]} />
      <View style={styles.zeroTick} />
    </View>
  )
}

export default function ImuScreen() {
  const pitch = useLiveMetric(liveSelectors.pitch)
  const roll = useLiveMetric(liveSelectors.roll)
  const balancePitch = useLiveMetric(liveSelectors.balancePitch)
  const windowMs = useLiveWindowMs()
  const boardConnected = useBleStore((state) => state.status === 'connected')
  const [remoteTiltValue, setRemoteTiltValue] = useState(60)
  const [remoteTiltDirection, setRemoteTiltDirection] = useState<0 | 1>(1)
  const [remoteTiltActive, setRemoteTiltActive] = useState(false)

  useEffect(
    () => () => {
      void stopRemoteTilt()
    },
    [],
  )

  const updateRemoteTilt = (value: number) => {
    setRemoteTiltValue(value)
    if (remoteTiltActive) void setRemoteTilt(remoteTiltDirection, value)
  }

  const startRemoteTilt = (direction: 0 | 1) => {
    setRemoteTiltDirection(direction)
    setRemoteTiltActive(true)
    void setRemoteTilt(direction, remoteTiltValue)
  }

  const stopRemoteTiltControl = () => {
    setRemoteTiltActive(false)
    void stopRemoteTilt()
  }

  const pitchPoints = useMemo(() => toTelemetryChartPoints(pitch), [pitch])

  const rollPoints = useMemo(() => toTelemetryChartPoints(roll), [roll])

  const balancePoints = useMemo(() => toTelemetryChartPoints(balancePitch), [balancePitch])

  const pitchRange = useMemo(
    () => computeAutoRange(pitchPoints, { baseline: pitchCfg.chartRange }),
    [pitchPoints],
  )
  const rollRange = useMemo(
    () => computeAutoRange(rollPoints, { baseline: rollCfg.chartRange }),
    [rollPoints],
  )
  const balanceRange = useMemo(
    () => computeAutoRange(balancePoints, { baseline: balanceCfg.chartRange }),
    [balancePoints],
  )
  const currentPitch = latestValue(pitchPoints)
  const currentRoll = latestValue(rollPoints)
  const currentBalancePitch = latestValue(balancePoints)
  const pitchDeg = rotationDeg(currentPitch)
  const rollDeg = rotationDeg(currentRoll)
  const balanceDeg = rotationDeg(currentBalancePitch)

  return (
    <ControlDetailLayout title="IMU">
      <View style={styles.liveRow}>
        <View style={styles.liveCell}>
          <Text style={styles.liveLabel}>{pitchCfg.label.toUpperCase()}</Text>
          <Text style={styles.liveValue}>
            {pitchPoints.at(-1) ? pitchCfg.formatWithUnit(pitchPoints.at(-1)!.value) : DASH}
          </Text>
        </View>
        <View style={styles.liveCell}>
          <Text style={styles.liveLabel}>{rollCfg.label.toUpperCase()}</Text>
          <Text style={styles.liveValue}>
            {rollPoints.at(-1) ? rollCfg.formatWithUnit(rollPoints.at(-1)!.value) : DASH}
          </Text>
        </View>
        <View style={styles.liveCell}>
          <Text style={styles.liveLabel}>BAL</Text>
          <Text style={styles.liveValue}>
            {balancePoints.at(-1) ? balanceCfg.formatWithUnit(balancePoints.at(-1)!.value) : DASH}
          </Text>
        </View>
      </View>

      <View style={styles.attitudePanel}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>ATTITUDE</Text>
          <Text style={styles.sectionHint}>Gray line shows balance pitch</Text>
        </View>
        <View style={styles.attitudeGrid}>
          <AttitudeView
            title="SIDE"
            value={currentPitch == null ? DASH : pitchCfg.formatWithUnit(currentPitch)}
          >
            <ZeroLevelMarker
              color={currentPitch == null ? theme.neutral.textDim : theme.wheel.color}
            />
            <View
              style={[
                styles.balanceLine,
                {
                  transform: [{ rotate: `${balanceDeg}deg` }],
                },
              ]}
            />
            <View
              style={[
                styles.sideBoard,
                {
                  transform: [{ rotate: `${pitchDeg}deg` }],
                  backgroundColor: currentPitch == null ? theme.neutral.textDim : theme.wheel.color,
                },
              ]}
            />
          </AttitudeView>

          <AttitudeView
            title="BACK"
            value={currentRoll == null ? DASH : rollCfg.formatWithUnit(currentRoll)}
          >
            <ZeroLevelMarker
              color={currentRoll == null ? theme.neutral.textDim : theme.teal.color}
            />
            <View
              style={[
                styles.frontBoard,
                {
                  transform: [{ rotate: `${rollDeg}deg` }],
                  backgroundColor: currentRoll == null ? theme.neutral.textDim : theme.teal.color,
                },
              ]}
            />
          </AttitudeView>
        </View>
      </View>

      <View style={styles.remoteTiltControl}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>REMOTE TILT</Text>
          <Text style={styles.remoteTiltValue}>{remoteTiltValue}</Text>
        </View>
        <Text style={styles.remoteTiltHint}>
          Set value, then hold a direction. Releasing stops temporary control. No tune XML write.
        </Text>
        <Text style={styles.remoteTiltWarning}>Can drive motor while board is READY.</Text>
        <Slider
          disabled={!boardConnected}
          minimumValue={20}
          maximumValue={80}
          step={1}
          value={remoteTiltValue}
          minimumTrackTintColor={theme.wheel.color}
          maximumTrackTintColor={theme.neutral.border}
          thumbTintColor={theme.wheel.color}
          onValueChange={updateRemoteTilt}
        />
        <View style={styles.remoteTiltActions}>
          <Pressable
            accessibilityRole="button"
            disabled={!boardConnected}
            onPressIn={() => startRemoteTilt(0)}
            onPressOut={stopRemoteTiltControl}
            style={({ pressed }) => [
              styles.remoteTiltButton,
              remoteTiltActive && remoteTiltDirection === 0 && styles.remoteTiltButtonActive,
              pressed && styles.remoteTiltButtonPressed,
              !boardConnected && styles.remoteTiltButtonDisabled,
            ]}
          >
            <Text style={styles.remoteTiltButtonText}>HOLD BACK</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!boardConnected}
            onPressIn={() => startRemoteTilt(1)}
            onPressOut={stopRemoteTiltControl}
            style={({ pressed }) => [
              styles.remoteTiltButton,
              remoteTiltActive && remoteTiltDirection === 1 && styles.remoteTiltButtonActive,
              pressed && styles.remoteTiltButtonPressed,
              !boardConnected && styles.remoteTiltButtonDisabled,
            ]}
          >
            <Text style={styles.remoteTiltButtonText}>HOLD FORWARD</Text>
          </Pressable>
        </View>
        {!boardConnected ? (
          <Text style={styles.remoteTiltDisabled}>Connect board to control tilt.</Text>
        ) : null}
      </View>

      <MetricDetailChart
        metric={pitchCfg}
        label={pitchCfg.label}
        points={pitchPoints}
        range={pitchRange}
        height={80}
        windowMs={windowMs}
      />

      <MetricDetailChart
        metric={rollCfg}
        label={rollCfg.label}
        points={rollPoints}
        range={rollRange}
        height={80}
        windowMs={windowMs}
      />

      <MetricDetailChart
        metric={balanceCfg}
        label={balanceCfg.label}
        points={balancePoints}
        range={balanceRange}
        height={80}
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
    backgroundColor: theme.neutral.surface,
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  liveLabel: {
    color: theme.neutral.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  liveValue: {
    color: theme.neutral.textPrimary,
    fontSize: 20,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  attitudePanel: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionLabel: {
    color: theme.neutral.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sectionHint: {
    color: theme.neutral.textDim,
    fontSize: 11,
    fontWeight: '600',
  },
  attitudeGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  remoteTiltControl: {
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    backgroundColor: theme.neutral.surface,
  },
  remoteTiltValue: {
    color: theme.wheel.text,
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  remoteTiltHint: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  remoteTiltDisabled: {
    color: theme.neutral.textDim,
    fontSize: 12,
  },
  remoteTiltWarning: {
    color: theme.warning.text,
    fontSize: 12,
    fontWeight: '600',
  },
  remoteTiltActions: {
    flexDirection: 'row',
    gap: 8,
  },
  remoteTiltButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.neutral.border,
  },
  remoteTiltButtonActive: {
    borderColor: theme.wheel.color,
    backgroundColor: theme.wheel.color,
  },
  remoteTiltButtonPressed: {
    opacity: 0.75,
  },
  remoteTiltButtonDisabled: {
    opacity: 0.45,
  },
  remoteTiltButtonText: {
    color: theme.neutral.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  attitudeView: {
    flex: 1,
    minHeight: 176,
    backgroundColor: theme.neutral.surface,
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  attitudeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  attitudeTitle: {
    color: theme.neutral.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  attitudeValue: {
    color: theme.neutral.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  attitudeCanvas: {
    flex: 1,
    minHeight: 128,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  zeroLevelMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    gap: 5,
    zIndex: 2,
  },
  zeroTick: {
    width: 12,
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.neutral.textDim,
  },
  zeroRing: {
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: theme.neutral.textDim,
  },
  sideBoard: {
    position: 'absolute',
    width: '72%',
    height: 4,
    borderRadius: 2,
  },
  balanceLine: {
    position: 'absolute',
    width: '54%',
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.neutral.textMuted,
  },
  frontBoard: {
    position: 'absolute',
    width: '70%',
    height: 4,
    borderRadius: 2,
  },
})
