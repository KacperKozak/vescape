import { useMemo } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import {
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { Canvas, Group, Path } from '@shopify/react-native-skia'

import { Text } from '@/components/base/Text'
import { type DualGaugeAlert } from '@/components/charts/gaugeAlert'
import { SparklineMaxBadge, type SparklinePoint } from '@/components/charts/Sparkline'
import { buildSparklinePaths, SparklineLayer } from '@/components/charts/SparklineLayer'
import { interaction, theme, type AlphaLevel } from '@/constants/theme'
import { telemetry } from '@/modules/board/constants/telemetry'
import {
  getHistoryMetricHotRange,
  type MetricHotRange,
} from '@/modules/history/lib/metricColorScale'
import { routes } from '@/navigation/routes'
import {
  arcPath,
  clamp01,
  radialTickPath,
  STROKE,
  svgPath,
  wedgePath,
  type Arc,
} from '@/modules/board/components/gauge/arcGeometry'
import {
  AlertMarker,
  AnimatedTextInput,
  gaugeRampColor,
  GlowGradient,
  useCanvasSize,
} from '@/modules/board/components/gauge/gaugeShared'
import { useResolvedNeutralColors } from '@/hooks/useTheme'

interface DualGaugeProps {
  speedValue: SharedValue<number | null>
  dutyValue: SharedValue<number | null>
  speedSeries?: SparklinePoint[]
  dutySeries?: SparklinePoint[]
  windowMs?: number
  speedMax?: number
  dutyMax?: number
  speedHotRange?: MetricHotRange | null
  dutyHotRange?: MetricHotRange | null
  speedAlerts?: DualGaugeAlert[]
  dutyAlerts?: DualGaugeAlert[]
  compact?: boolean
  transparent?: boolean
  split?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

// Quarter-arc geometry. Left arc sweeps π → π/2, right arc sweeps 0 → π/2,
// so the two mirror each other around the gap between them.
const R = 80
const VB_H = 120
const MARKER_INSET = 10
const LEFT_ARC: Arc = { cx: 100, cy: 100, r: R, from: Math.PI, to: Math.PI / 2 }
const RIGHT_ARC: Arc = { cx: 10, cy: 100, r: R, from: 0, to: Math.PI / 2 }

// Cropped viewBox per side — removes empty space so arc fills container width
const CROP_PAD = 1
const CROP_TOP = 12
const VB_CROP_W = R + CROP_PAD * 2
const VB_CROP_H = VB_H - CROP_TOP
const VB_CROP_LEFT_X = LEFT_ARC.cx - R - CROP_PAD
const VB_CROP_RIGHT_X = RIGHT_ARC.cx - CROP_PAD

const SPARKLINE_HEIGHT = 28
const SPARKLINE_TOP = 12
const SPARKLINE_GAP = 32

const GLOW_STOPS = [0, 0.6, 0.95, 1]
const GLOW_OPACITIES: AlphaLevel[] = [0, 0, 0.12, 0.3]

const BG_ARC_LEFT = svgPath(arcPath(LEFT_ARC, 1))
const BG_ARC_RIGHT = svgPath(arcPath(RIGHT_ARC, 1))

interface QuarterArcProps {
  side: 'left' | 'right'
  value: SharedValue<number | null>
  max: number
  color: string
  unit: string
  alerts?: DualGaugeAlert[]
  hotRange?: MetricHotRange | null
}

interface QuarterArcLayerProps extends QuarterArcProps {
  transform: ({ translateX: number } | { translateY: number } | { scale: number })[]
}

function QuarterArcLayer({
  side,
  value,
  max,
  color,
  alerts = [],
  hotRange,
  transform,
}: QuarterArcLayerProps) {
  const neutral = useResolvedNeutralColors()
  const isLeft = side === 'left'
  const arc = isLeft ? LEFT_ARC : RIGHT_ARC

  const arcPathValue = useDerivedValue(() =>
    svgPath(arcPath(arc, clamp01((value.value ?? 0) / max))),
  )
  const arcColor = useDerivedValue(() => gaugeRampColor(value.value ?? 0, color, hotRange))
  const wedgePathValue = useDerivedValue(() =>
    svgPath(wedgePath(arc, clamp01((value.value ?? 0) / max))),
  )
  const markerPath = useDerivedValue(() =>
    radialTickPath(arc, clamp01((value.value ?? 0) / max), MARKER_INSET),
  )

  return (
    <Group transform={transform}>
      {/* Gradient wedge fill */}
      <Path path={wedgePathValue}>
        <GlowGradient arc={arc} color={color} stops={GLOW_STOPS} opacities={GLOW_OPACITIES} />
      </Path>

      {/* Static background arc */}
      <Path
        path={isLeft ? BG_ARC_LEFT : BG_ARC_RIGHT}
        color={neutral.border}
        style="stroke"
        strokeWidth={STROKE}
        strokeCap="butt"
      />

      {/* Animated colored arc overlay */}
      <Path
        path={arcPathValue}
        color={arcColor}
        style="stroke"
        strokeWidth={STROKE}
        strokeCap="butt"
      />

      {alerts.map((alert) => (
        <AlertMarker key={alert.id} arc={arc} alert={alert} max={max} />
      ))}

      {/* Position marker */}
      <Path path={markerPath} color={arcColor} style="stroke" strokeWidth={1.5} strokeCap="butt" />
    </Group>
  )
}

function GaugeValue({
  side,
  value,
  color,
  hotRange,
  unit,
  bounds,
}: QuarterArcProps & { bounds: { top: number; bottom: number } }) {
  const animatedValueProps = useAnimatedProps(() => {
    const current = value.value
    const text = current != null ? Math.round(current).toString() : '—'
    return { text, value: text }
  })
  const animatedValueStyle = useAnimatedStyle(() => ({
    color: gaugeRampColor(value.value, color, hotRange),
  }))
  return (
    <View
      style={[side === 'left' ? styles.bowlLeft : styles.bowlRight, bounds]}
      pointerEvents="none"
    >
      <AnimatedTextInput
        editable={false}
        animatedProps={animatedValueProps}
        style={[styles.value, animatedValueStyle]}
      />
      <Text style={styles.unit}>{unit}</Text>
    </View>
  )
}

interface GaugePairProps {
  speedValue: SharedValue<number | null>
  dutyValue: SharedValue<number | null>
  speedMax: number
  dutyMax: number
  speedAlerts: DualGaugeAlert[]
  dutyAlerts: DualGaugeAlert[]
  speedHotRange: MetricHotRange | null
  dutyHotRange: MetricHotRange | null
  speedSeries: SparklinePoint[]
  dutySeries: SparklinePoint[]
  windowMs?: number
}

function GaugePair({
  speedValue,
  dutyValue,
  speedMax,
  dutyMax,
  speedAlerts,
  dutyAlerts,
  speedHotRange,
  dutyHotRange,
  speedSeries,
  dutySeries,
  windowMs,
}: GaugePairProps) {
  const { size, onLayout } = useCanvasSize()
  const cellWidth = Math.max(0, (size.w - SPARKLINE_GAP) / 2)
  const scale = cellWidth / VB_CROP_W
  const gaugeHeight = cellWidth * (VB_CROP_H / VB_CROP_W)
  const sparklinePaths = useMemo(
    () => [
      buildSparklinePaths({
        points: speedSeries,
        width: cellWidth,
        height: SPARKLINE_HEIGHT,
        range: { min: 0, max: speedMax },
        windowMs,
      }),
      buildSparklinePaths({
        points: dutySeries,
        width: cellWidth,
        height: SPARKLINE_HEIGHT,
        range: { min: 0, max: dutyMax },
        windowMs,
      }),
    ],
    [cellWidth, dutyMax, dutySeries, speedMax, speedSeries, windowMs],
  )
  const leftTransform = useMemo(
    () => [
      { translateX: -VB_CROP_LEFT_X * scale },
      { translateY: SPARKLINE_HEIGHT + SPARKLINE_TOP - CROP_TOP * scale },
      { scale },
    ],
    [scale],
  )
  const rightTransform = useMemo(
    () => [
      { translateX: cellWidth + SPARKLINE_GAP - VB_CROP_RIGHT_X * scale },
      { translateY: SPARKLINE_HEIGHT + SPARKLINE_TOP - CROP_TOP * scale },
      { scale },
    ],
    [cellWidth, scale],
  )
  const valueBounds = {
    top: SPARKLINE_HEIGHT + SPARKLINE_TOP + gaugeHeight * 0.1,
    bottom: gaugeHeight * 0.05,
  }
  return (
    <View style={styles.gaugePair} onLayout={onLayout}>
      {scale > 0 ? (
        <Canvas style={styles.svg}>
          <Group transform={[{ translateY: SPARKLINE_TOP }]}>
            <SparklineLayer paths={sparklinePaths[0]} color={telemetry.speed.color} showMax />
          </Group>
          <Group
            transform={[{ translateX: cellWidth + SPARKLINE_GAP }, { translateY: SPARKLINE_TOP }]}
          >
            <SparklineLayer paths={sparklinePaths[1]} color={telemetry.duty.color} showMax />
          </Group>
          <QuarterArcLayer
            side="left"
            value={speedValue}
            max={speedMax}
            color={telemetry.speed.color}
            unit="km/h"
            alerts={speedAlerts}
            hotRange={speedHotRange}
            transform={leftTransform}
          />
          <QuarterArcLayer
            side="right"
            value={dutyValue}
            max={dutyMax}
            color={telemetry.duty.color}
            unit="%"
            alerts={dutyAlerts}
            hotRange={dutyHotRange}
            transform={rightTransform}
          />
        </Canvas>
      ) : null}
      <GaugeValue
        side="left"
        value={speedValue}
        max={speedMax}
        color={telemetry.speed.color}
        unit="km/h"
        hotRange={speedHotRange}
        bounds={valueBounds}
      />
      <GaugeValue
        side="right"
        value={dutyValue}
        max={dutyMax}
        color={telemetry.duty.color}
        unit="%"
        hotRange={dutyHotRange}
        bounds={valueBounds}
      />
    </View>
  )
}

export function DualGauge({
  speedValue,
  dutyValue,
  speedSeries,
  dutySeries,
  windowMs,
  speedMax = 50,
  dutyMax = 100,
  speedHotRange = getHistoryMetricHotRange('speed'),
  dutyHotRange = getHistoryMetricHotRange('duty'),
  speedAlerts = [],
  dutyAlerts = [],
  compact = false,
  transparent = false,
  split = false,
  containerStyle,
}: DualGaugeProps) {
  const router = useRouter()
  return (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        transparent && styles.wrapTransparent,
        containerStyle,
      ]}
    >
      <View style={styles.gaugeContent}>
        <View style={[styles.row, split && styles.rowSplit]} pointerEvents="none">
          <View style={[styles.halfPressable, split && styles.halfPressableSplit]}>
            <SparklineMaxBadge
              points={speedSeries ?? []}
              color={telemetry.speed.color}
              fmt={telemetry.speed.formatWithUnit}
              position="left"
            />
          </View>
          <View style={[styles.halfPressable, split && styles.halfPressableSplit]}>
            <SparklineMaxBadge
              points={dutySeries ?? []}
              color={telemetry.duty.color}
              fmt={telemetry.duty.formatWithUnit}
            />
          </View>
        </View>
        <GaugePair
          speedValue={speedValue}
          dutyValue={dutyValue}
          speedMax={speedMax}
          dutyMax={dutyMax}
          speedAlerts={speedAlerts}
          dutyAlerts={dutyAlerts}
          speedHotRange={speedHotRange}
          dutyHotRange={dutyHotRange}
          speedSeries={speedSeries ?? []}
          dutySeries={dutySeries ?? []}
          windowMs={windowMs}
        />
        <View style={styles.gaugeTouchRow}>
          <Pressable
            style={styles.halfPressable}
            onPress={() => router.push(routes.controlSpeed)}
            android_ripple={interaction.ripple}
          />
          <Pressable
            style={styles.halfPressable}
            onPress={() => router.push(routes.controlDuty)}
            android_ripple={interaction.ripple}
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.neutral.surface,
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 4,
    marginBottom: 6,
    position: 'relative',
  },
  wrapCompact: {
    paddingHorizontal: 20,
    paddingVertical: 2,
    marginHorizontal: 0,
    marginBottom: 0,
  },
  wrapTransparent: {
    backgroundColor: 'transparent',
  },
  halfPressable: {
    flex: 1,
    overflow: 'visible',
  },
  gaugeContent: { position: 'relative' },
  gaugeTouchRow: { position: 'absolute', inset: 0, flexDirection: 'row', gap: 32 },
  row: {
    flexDirection: 'row',
    gap: 32,
    position: 'relative',
  },
  gaugePair: { width: '100%', aspectRatio: 1.4, position: 'relative' },
  rowSplit: {
    justifyContent: 'space-between',
  },
  halfPressableSplit: {
    flex: 4,
  },
  svg: {
    width: '100%',
    height: '100%',
  },
  bowlLeft: {
    position: 'absolute',
    left: '5%',
    right: '55%',
    top: '10%',
    bottom: '5%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bowlRight: {
    position: 'absolute',
    left: '55%',
    right: '5%',
    top: '10%',
    bottom: '5%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: theme.neutral.textPrimary,
    fontSize: 36,
    fontFamily: 'monospace',
    fontWeight: '700',
    lineHeight: 40,
    padding: 0,
    textAlign: 'center',
  },
  unit: {
    color: theme.neutral.textMuted,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
})
