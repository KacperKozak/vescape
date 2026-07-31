import { type ReactNode, useMemo } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { Text } from '@/components/base/Text'
import Animated, {
  useAnimatedStyle,
  type AnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'

import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/modules/board/components/ControlDetailLayout'
import { MetricDetailChart } from '@/modules/board/components/MetricDetailChart'
import { RemoteTiltControl } from '@/modules/board/components/RemoteTiltControl'
import { toTelemetryChartPoints } from '@/modules/board/components/metricDetailData'
import { TickText } from '@/components/base/TickText'
import { telemetry } from '@/modules/board/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/modules/board/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/modules/settings/store/settingsStore'
import { theme } from '@/constants/theme'
import { useResolvedAccentColors, useResolvedNeutralColors } from '@/hooks/useTheme'
import { liveTelemetryRuntime } from '@/modules/board/lib/liveTelemetryRuntime'

const pitchCfg = telemetry.pitch
const rollCfg = telemetry.roll
const balanceCfg = telemetry.balancePitch

interface AttitudeViewProps {
  title: string
  value: SharedValue<number | null>
  unit: string
  accentColor: string
  children: ReactNode
}

function AttitudeView({ title, value, unit, accentColor, children }: AttitudeViewProps) {
  return (
    <View style={styles.attitudeView}>
      <View style={styles.attitudeHeader}>
        <Text style={styles.attitudeTitle}>{title}</Text>
        <TickText value={value} decimals={1} unit={unit} style={styles.attitudeValue} />
      </View>
      <View style={[styles.attitudeAccent, { backgroundColor: accentColor }]} />
      <View style={styles.attitudeCanvas}>{children}</View>
    </View>
  )
}

interface LiveMetricReadoutProps {
  label: string
  value: SharedValue<number | null>
  decimals: number
  unit: string
  color: string
}

function LiveMetricReadout({ label, value, decimals, unit, color }: LiveMetricReadoutProps) {
  return (
    <View style={styles.liveCell}>
      <Text style={styles.liveLabel}>{label.toUpperCase()}</Text>
      <TickText
        value={value}
        decimals={decimals}
        unit={unit}
        style={[styles.liveValue, { color }]}
      />
    </View>
  )
}

interface HotAttitudeBarsProps {
  pitch: SharedValue<number | null>
  roll: SharedValue<number | null>
  balancePitch: SharedValue<number | null>
}

function HotAttitudeBars({ pitch, roll, balancePitch }: HotAttitudeBarsProps) {
  const neutral = useResolvedNeutralColors()
  const accents = useResolvedAccentColors()
  const pitchZeroColorStyle = useAnimatedStyle<ViewStyle>(
    () => ({
      backgroundColor: pitch.value == null ? neutral.textDim : accents.sky.color,
    }),
    [accents.sky.color, neutral.textDim],
  )
  const rollZeroColorStyle = useAnimatedStyle<ViewStyle>(
    () => ({
      backgroundColor: roll.value == null ? neutral.textDim : accents.cyan.color,
    }),
    [accents.cyan.color, neutral.textDim],
  )
  const balanceLineStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ rotate: `${balancePitch.value ?? 0}deg` }],
  }))
  const pitchBoardStyle = useAnimatedStyle<ViewStyle>(
    () => ({
      transform: [{ rotate: `${pitch.value ?? 0}deg` }],
      backgroundColor: pitch.value == null ? neutral.textDim : accents.sky.color,
    }),
    [accents.sky.color, neutral.textDim],
  )
  const rollBoardStyle = useAnimatedStyle<ViewStyle>(
    () => ({
      transform: [{ rotate: `${roll.value ?? 0}deg` }],
      backgroundColor: roll.value == null ? neutral.textDim : accents.cyan.color,
    }),
    [accents.cyan.color, neutral.textDim],
  )

  return (
    <View style={styles.attitudeGrid}>
      <AttitudeView title="SIDE" value={pitch} unit={pitchCfg.unit} accentColor={accents.sky.color}>
        <ZeroLevelMarker colorStyle={pitchZeroColorStyle} />
        <Animated.View style={[styles.balanceLine, balanceLineStyle]} />
        <Animated.View style={[styles.sideBoard, pitchBoardStyle]} />
      </AttitudeView>

      <AttitudeView title="BACK" value={roll} unit={rollCfg.unit} accentColor={accents.cyan.color}>
        <ZeroLevelMarker colorStyle={rollZeroColorStyle} />
        <Animated.View style={[styles.frontBoard, rollBoardStyle]} />
      </AttitudeView>
    </View>
  )
}

interface ZeroLevelMarkerProps {
  colorStyle: AnimatedStyle<ViewStyle>
}

function ZeroLevelMarker({ colorStyle }: ZeroLevelMarkerProps) {
  return (
    <View pointerEvents="none" style={styles.zeroLevelMarker}>
      <View style={styles.zeroTick} />
      <Animated.View style={[styles.zeroRing, colorStyle]} />
      <View style={styles.zeroTick} />
    </View>
  )
}

export default function ImuScreen() {
  const neutral = useResolvedNeutralColors()
  const pitch = useLiveMetric(liveSelectors.pitch)
  const roll = useLiveMetric(liveSelectors.roll)
  const balancePitch = useLiveMetric(liveSelectors.balancePitch)
  const windowMs = useLiveWindowMs()
  const hot = liveTelemetryRuntime.values

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

  return (
    <ControlDetailLayout title="IMU">
      <View style={styles.liveRow}>
        <LiveMetricReadout
          label={pitchCfg.label}
          value={hot.pitch}
          decimals={pitchCfg.decimals}
          unit={pitchCfg.unit}
          color={theme.palette.sky.color}
        />
        <LiveMetricReadout
          label={rollCfg.label}
          value={hot.roll}
          decimals={rollCfg.decimals}
          unit={rollCfg.unit}
          color={theme.palette.cyan.color}
        />
        <LiveMetricReadout
          label="Balance"
          value={hot.balancePitch}
          decimals={balanceCfg.decimals}
          unit={balanceCfg.unit}
          color={neutral.textSecondary}
        />
      </View>

      <View style={styles.attitudePanel}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>ATTITUDE</Text>
          <Text style={styles.sectionHint}>Gray line shows balance pitch</Text>
        </View>
        <HotAttitudeBars pitch={hot.pitch} roll={hot.roll} balancePitch={hot.balancePitch} />
      </View>

      <RemoteTiltControl />

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
    gap: 18,
    alignItems: 'flex-end',
  },
  liveCell: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  liveLabel: {
    color: theme.neutral.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  liveValue: {
    fontSize: 24,
    fontFamily: 'monospace',
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
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
  attitudeView: {
    flex: 1,
    minHeight: 176,
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
    letterSpacing: 0.7,
  },
  attitudeValue: {
    color: theme.neutral.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  attitudeAccent: {
    height: 2,
    borderRadius: 1,
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
    height: 3,
    borderRadius: 1.5,
  },
  balanceLine: {
    position: 'absolute',
    width: '54%',
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.neutral.textMuted,
  },
  frontBoard: {
    position: 'absolute',
    width: '70%',
    height: 3,
    borderRadius: 1.5,
  },
})
