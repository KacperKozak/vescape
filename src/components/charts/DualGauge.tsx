import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { type ReactNode, useId } from 'react'
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import Svg, { Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { telemetry } from '@/constants/telemetry'
import { interaction, theme } from '@/constants/theme'
import { routes } from '@/navigation/routes'

export interface DualGaugeAlert {
  id: string
  threshold: number
  thresholdMax: number | null
}

interface DualGaugeProps {
  speedValue: SharedValue<number | null>
  dutyValue: SharedValue<number | null>
  speedSeries?: SparklinePoint[]
  dutySeries?: SparklinePoint[]
  windowMs?: number
  speedMax?: number
  dutyMax?: number
  speedAlerts?: DualGaugeAlert[]
  dutyAlerts?: DualGaugeAlert[]
  compact?: boolean
  transparent?: boolean
  split?: boolean
  middleSlot?: ReactNode
  containerStyle?: StyleProp<ViewStyle>
}

interface SingleGaugeProps {
  value: SharedValue<number | null>
  min?: number
  max: number
  color: string
  unit: string
  decimals?: number
  label?: string
  alerts?: DualGaugeAlert[]
  containerStyle?: StyleProp<ViewStyle>
}

// Quarter-arc geometry constants
const VB_H = 120
const R = 80
const STROKE = 1
const MARKER_INSET = 10

const GLOW_GRADIENT_ID_LEFT = 'dualGaugeGlowLeft'
const GLOW_GRADIENT_ID_RIGHT = 'dualGaugeGlowRight'
const ALERT_RANGE_GRADIENT_ID = 'dualGaugeAlertRangeLeft'
const ALERT_RANGE_GRADIENT_ID_RIGHT = 'dualGaugeAlertRangeRight'

// Left arc center: (100, 100). Right arc center: (10, 100).
const LEFT_CX = 100
const LEFT_CY = 100
const RIGHT_CX = 10
const RIGHT_CY = 100

// Cropped viewBox per side — removes empty space so arc fills container width
const CROP_PAD = 1
const CROP_TOP = 12
const VB_CROP_W = R + CROP_PAD * 2
const VB_CROP_H = VB_H - CROP_TOP
const VB_CROP_LEFT_X = LEFT_CX - R - CROP_PAD
const VB_CROP_RIGHT_X = RIGHT_CX - CROP_PAD

const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedLine = Animated.createAnimatedComponent(Line)
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

function clamp01(f: number) {
  'worklet'
  return Math.min(1, Math.max(0, f))
}

// Left arc: angle sweeps from π (f=0) to π/2 (f=1)
// polarLeft(r, 0) → (100+80*cos(π), 100) = (20, 100)
// polarLeft(r, 1) → (100+80*cos(π/2), 100-80*sin(π/2)) = (100, 20)
function polarLeft(r: number, fraction: number) {
  'worklet'
  const angle = Math.PI - (Math.PI / 2) * fraction
  return { x: LEFT_CX + r * Math.cos(angle), y: LEFT_CY - r * Math.sin(angle) }
}

// Right arc: angle sweeps from 0 (f=0) to π/2 (f=1)
// polarRight(r, 0) → (10+80*cos(0), 100) = (90, 100)  [3-o'clock, bottom-right]
// polarRight(r, 1) → (10+80*cos(π/2), 100-80*sin(π/2)) = (10, 20)  [12-o'clock, top]
function polarRight(r: number, fraction: number) {
  'worklet'
  const angle = (Math.PI / 2) * fraction
  return { x: RIGHT_CX + r * Math.cos(angle), y: RIGHT_CY - r * Math.sin(angle) }
}

function arcPathLeft(f: number) {
  'worklet'
  const end = polarLeft(R, clamp01(f))
  const start = polarLeft(R, 0)
  return `M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`
}

function arcPathRight(f: number) {
  'worklet'
  const end = polarRight(R, clamp01(f))
  const start = polarRight(R, 0)
  return `M ${start.x} ${start.y} A ${R} ${R} 0 0 0 ${end.x} ${end.y}`
}

function wedgePathLeft(f: number) {
  'worklet'
  const c = clamp01(f)
  if (c <= 0) return ''
  const start = polarLeft(R, 0)
  const end = polarLeft(R, c)
  return `M ${LEFT_CX} ${LEFT_CY} L ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y} Z`
}

function wedgePathRight(f: number) {
  'worklet'
  const c = clamp01(f)
  if (c <= 0) return ''
  const start = polarRight(R, 0)
  const end = polarRight(R, c)
  return `M ${RIGHT_CX} ${RIGHT_CY} L ${start.x} ${start.y} A ${R} ${R} 0 0 0 ${end.x} ${end.y} Z`
}

function rangeWedgePathLeft(fromFraction: number, toFraction: number) {
  const from = clamp01(fromFraction)
  const to = clamp01(toFraction)
  if (to <= from) return ''
  const radius = R - STROKE / 2
  const start = polarLeft(radius, from)
  const end = polarLeft(radius, to)
  return `M ${LEFT_CX} ${LEFT_CY} L ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y} Z`
}

function rangeWedgePathRight(fromFraction: number, toFraction: number) {
  const from = clamp01(fromFraction)
  const to = clamp01(toFraction)
  if (to <= from) return ''
  const radius = R - STROKE / 2
  const start = polarRight(radius, from)
  const end = polarRight(radius, to)
  return `M ${RIGHT_CX} ${RIGHT_CY} L ${start.x} ${start.y} A ${radius} ${radius} 0 0 0 ${end.x} ${end.y} Z`
}

// Precomputed static background arcs (full arc, f=1)
const BG_ARC_LEFT = arcPathLeft(1)
const BG_ARC_RIGHT = arcPathRight(1)

// ── Alert sub-components ──────────────────────────────────────────────────────

const TICK_LENGHT = 2
const TICK_WIDTH = 0.35

interface AlertTickProps {
  side: 'left' | 'right'
  fraction: number
}

function AlertTick({ side, fraction }: AlertTickProps) {
  const inner =
    side === 'left' ? polarLeft(R - TICK_LENGHT, fraction) : polarRight(R - TICK_LENGHT, fraction)
  const outer =
    side === 'left' ? polarLeft(R - STROKE / 2, fraction) : polarRight(R - STROKE / 2, fraction)

  return (
    <Line
      x1={inner.x}
      y1={inner.y}
      x2={outer.x}
      y2={outer.y}
      stroke={theme.highlight.color}
      strokeWidth={TICK_WIDTH}
      strokeLinecap="butt"
    />
  )
}

interface AlertMarkerProps {
  side: 'left' | 'right'
  alert: DualGaugeAlert
  max: number
}

function AlertMarker({ side, alert, max }: AlertMarkerProps) {
  const thresholdFraction = clamp01(alert.threshold / max)
  const maxFraction = alert.thresholdMax == null ? null : clamp01(alert.thresholdMax / max)
  const rangePath =
    maxFraction != null
      ? side === 'left'
        ? rangeWedgePathLeft(thresholdFraction, maxFraction)
        : rangeWedgePathRight(thresholdFraction, maxFraction)
      : ''
  const rangeGradientId = side === 'left' ? ALERT_RANGE_GRADIENT_ID : ALERT_RANGE_GRADIENT_ID_RIGHT

  if (maxFraction != null && rangePath) {
    return (
      <>
        <Path d={rangePath} fill={`url(#${rangeGradientId})`} stroke="none" />
        <AlertTick side={side} fraction={thresholdFraction} />
        <AlertTick side={side} fraction={maxFraction} />
      </>
    )
  }

  return <AlertTick side={side} fraction={thresholdFraction} />
}

// ── HalfArc sub-component ───────────────────────────────────────────────────

const HALF_CX = 100
const HALF_CY = 100
const HALF_R = 88
const HALF_VB_W = 200
const HALF_VB_H = 112

function normalizeFraction(value: number, min: number, max: number) {
  'worklet'
  const span = max - min
  if (span <= 0) return 0
  return clamp01((value - min) / span)
}

function polarHalf(r: number, fraction: number) {
  'worklet'
  const angle = Math.PI - Math.PI * fraction
  return { x: HALF_CX + r * Math.cos(angle), y: HALF_CY - r * Math.sin(angle) }
}

function halfArcPath(fraction: number) {
  'worklet'
  const start = polarHalf(HALF_R, 0)
  const end = polarHalf(HALF_R, clamp01(fraction))
  return `M ${start.x} ${start.y} A ${HALF_R} ${HALF_R} 0 0 1 ${end.x} ${end.y}`
}

function halfWedgePath(fraction: number) {
  'worklet'
  const c = clamp01(fraction)
  if (c <= 0) return ''
  const start = polarHalf(HALF_R, 0)
  const end = polarHalf(HALF_R, c)
  return `M ${HALF_CX} ${HALF_CY} L ${start.x} ${start.y} A ${HALF_R} ${HALF_R} 0 0 1 ${end.x} ${end.y} Z`
}

function halfRangeWedgePath(fromFraction: number, toFraction: number) {
  const from = clamp01(fromFraction)
  const to = clamp01(toFraction)
  if (to <= from) return ''
  const radius = HALF_R - STROKE / 2
  const start = polarHalf(radius, from)
  const end = polarHalf(radius, to)
  return `M ${HALF_CX} ${HALF_CY} L ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y} Z`
}

const HALF_BG_ARC = halfArcPath(1)

interface HalfAlertTickProps {
  fraction: number
}

function HalfAlertTick({ fraction }: HalfAlertTickProps) {
  const inner = polarHalf(HALF_R - TICK_LENGHT, fraction)
  const outer = polarHalf(HALF_R - STROKE / 2, fraction)

  return (
    <Line
      x1={inner.x}
      y1={inner.y}
      x2={outer.x}
      y2={outer.y}
      stroke={theme.highlight.color}
      strokeWidth={TICK_WIDTH}
      strokeLinecap="butt"
    />
  )
}

interface HalfAlertMarkerProps {
  alert: DualGaugeAlert
  min: number
  max: number
  rangeGradientId: string
}

function HalfAlertMarker({ alert, min, max, rangeGradientId }: HalfAlertMarkerProps) {
  const thresholdFraction = normalizeFraction(alert.threshold, min, max)
  const maxFraction =
    alert.thresholdMax == null ? null : normalizeFraction(alert.thresholdMax, min, max)
  const rangePath = maxFraction != null ? halfRangeWedgePath(thresholdFraction, maxFraction) : ''

  if (maxFraction != null && rangePath) {
    return (
      <>
        <Path d={rangePath} fill={`url(#${rangeGradientId})`} stroke="none" />
        <HalfAlertTick fraction={thresholdFraction} />
        <HalfAlertTick fraction={maxFraction} />
      </>
    )
  }

  return <HalfAlertTick fraction={thresholdFraction} />
}

function HalfArc({
  value,
  min,
  max,
  color,
  unit,
  decimals = 0,
  alerts = [],
}: Required<Pick<SingleGaugeProps, 'value' | 'min' | 'max' | 'color' | 'unit'>> &
  Pick<SingleGaugeProps, 'decimals' | 'alerts'>) {
  const idSuffix = useId().replace(/:/g, '')
  const glowGradientId = `singleGaugeGlow${idSuffix}`
  const alertRangeGradientId = `singleGaugeAlertRange${idSuffix}`

  const animatedValueProps = useAnimatedProps(() => {
    const current = value.value
    const text =
      current != null
        ? decimals === 0
          ? Math.round(current).toString()
          : current.toFixed(decimals)
        : '—'
    return { text, value: text }
  })

  const animatedArcProps = useAnimatedProps(() => {
    const current = value.value ?? min
    return { d: halfArcPath(normalizeFraction(current, min, max)) }
  })

  const animatedWedgeProps = useAnimatedProps(() => {
    const current = value.value ?? min
    return { d: halfWedgePath(normalizeFraction(current, min, max)) }
  })

  const animatedMarkerProps = useAnimatedProps(() => {
    const current = value.value ?? min
    const fraction = normalizeFraction(current, min, max)
    const inner = polarHalf(HALF_R - MARKER_INSET, fraction)
    const outer = polarHalf(HALF_R + STROKE / 2, fraction)
    return { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y }
  })

  return (
    <View style={styles.halfWrap}>
      <Svg viewBox={`0 0 ${HALF_VB_W} ${HALF_VB_H}`} style={styles.svg}>
        <Defs>
          <RadialGradient
            id={glowGradientId}
            gradientUnits="userSpaceOnUse"
            cx={HALF_CX}
            cy={HALF_CY}
            r={HALF_R}
          >
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="0.58" stopColor={color} stopOpacity={0} />
            <Stop offset="0.94" stopColor={color} stopOpacity={0.2} />
            <Stop offset="1" stopColor={color} stopOpacity={0.38} />
          </RadialGradient>
          <RadialGradient
            id={alertRangeGradientId}
            gradientUnits="userSpaceOnUse"
            cx={HALF_CX}
            cy={HALF_CY}
            r={HALF_R}
          >
            <Stop offset="0" stopColor={theme.highlight.color} stopOpacity={0} />
            <Stop offset="0.82" stopColor={theme.highlight.color} stopOpacity={0} />
            <Stop offset="0.965" stopColor={theme.highlight.color} stopOpacity={0.06} />
            <Stop offset="0.99" stopColor={theme.highlight.color} stopOpacity={0.12} />
            <Stop offset="1" stopColor={theme.highlight.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <AnimatedPath animatedProps={animatedWedgeProps} fill={`url(#${glowGradientId})`} />
        <Path
          d={HALF_BG_ARC}
          stroke="#334155"
          strokeWidth={STROKE}
          strokeLinecap="butt"
          fill="none"
        />
        <AnimatedPath
          animatedProps={animatedArcProps}
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="butt"
          fill="none"
        />
        {alerts.map((alert) => (
          <HalfAlertMarker
            key={alert.id}
            alert={alert}
            min={min}
            max={max}
            rangeGradientId={alertRangeGradientId}
          />
        ))}
        <AnimatedLine
          animatedProps={animatedMarkerProps}
          stroke={color}
          strokeWidth={1.7}
          strokeLinecap="butt"
        />
      </Svg>

      <View style={styles.halfBowl} pointerEvents="none">
        <AnimatedTextInput
          editable={false}
          animatedProps={animatedValueProps}
          style={styles.halfValue}
        />
        <Text style={styles.halfUnit}>{unit}</Text>
      </View>
    </View>
  )
}

// ── QuarterArc sub-component ─────────────────────────────────────────────────

interface QuarterArcProps {
  side: 'left' | 'right'
  value: SharedValue<number | null>
  max: number
  color: string
  unit: string
  alerts?: DualGaugeAlert[]
}

function QuarterArc({ side, value, max, color, unit, alerts = [] }: QuarterArcProps) {
  const isLeft = side === 'left'
  const glowId = isLeft ? GLOW_GRADIENT_ID_LEFT : GLOW_GRADIENT_ID_RIGHT
  const alertRangeGradientId = isLeft ? ALERT_RANGE_GRADIENT_ID : ALERT_RANGE_GRADIENT_ID_RIGHT
  const cx = isLeft ? LEFT_CX : RIGHT_CX
  const cy = isLeft ? LEFT_CY : RIGHT_CY

  const animatedValueProps = useAnimatedProps(() => {
    const current = value.value
    const text = current != null ? Math.round(current).toString() : '—'
    return { text, value: text }
  })

  const animatedArcProps = useAnimatedProps(() => {
    const current = value.value ?? 0
    const f = clamp01(current / max)
    return { d: isLeft ? arcPathLeft(f) : arcPathRight(f) }
  })

  const animatedWedgeProps = useAnimatedProps(() => {
    const current = value.value ?? 0
    const f = clamp01(current / max)
    return { d: isLeft ? wedgePathLeft(f) : wedgePathRight(f) }
  })

  const animatedMarkerProps = useAnimatedProps(() => {
    const current = value.value ?? 0
    const fraction = clamp01(current / max)
    const inner = isLeft
      ? polarLeft(R - MARKER_INSET, fraction)
      : polarRight(R - MARKER_INSET, fraction)
    const outer = isLeft
      ? polarLeft(R + STROKE / 2, fraction)
      : polarRight(R + STROKE / 2, fraction)
    return { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y }
  })

  const bgArc = isLeft ? BG_ARC_LEFT : BG_ARC_RIGHT

  return (
    <View style={styles.quarterWrap}>
      <Svg
        viewBox={`${isLeft ? VB_CROP_LEFT_X : VB_CROP_RIGHT_X} ${CROP_TOP} ${VB_CROP_W} ${VB_CROP_H}`}
        style={styles.svg}
      >
        <Defs>
          <RadialGradient id={glowId} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={R}>
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="0.6" stopColor={color} stopOpacity={0} />
            <Stop offset="0.95" stopColor={color} stopOpacity={0.18} />
            <Stop offset="1" stopColor={color} stopOpacity={0.35} />
          </RadialGradient>
          <RadialGradient
            id={alertRangeGradientId}
            gradientUnits="userSpaceOnUse"
            cx={cx}
            cy={cy}
            r={R}
          >
            <Stop offset="0" stopColor={theme.highlight.color} stopOpacity={0} />
            <Stop offset="0.82" stopColor={theme.highlight.color} stopOpacity={0} />
            <Stop offset="0.965" stopColor={theme.highlight.color} stopOpacity={0.05} />
            <Stop offset="0.99" stopColor={theme.highlight.color} stopOpacity={0.1} />
            <Stop offset="1" stopColor={theme.highlight.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Gradient wedge fill */}
        <AnimatedPath animatedProps={animatedWedgeProps} fill={`url(#${glowId})`} stroke="none" />

        {/* Static background arc */}
        <Path d={bgArc} stroke="#334155" strokeWidth={STROKE} strokeLinecap="butt" fill="none" />

        {/* Animated colored arc overlay */}
        <AnimatedPath
          animatedProps={animatedArcProps}
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="butt"
          fill="none"
        />

        {/* Alert markers */}
        {alerts.map((alert) => (
          <AlertMarker key={alert.id} side={side} alert={alert} max={max} />
        ))}

        {/* Position marker */}
        <AnimatedLine
          animatedProps={animatedMarkerProps}
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="butt"
        />
      </Svg>

      {/* Value bowl — absolutely positioned over the SVG */}
      <View style={isLeft ? styles.bowlLeft : styles.bowlRight} pointerEvents="none">
        <AnimatedTextInput
          editable={false}
          animatedProps={animatedValueProps}
          style={styles.value}
        />
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  )
}

// ── DualGauge ────────────────────────────────────────────────────────────────

export function SingleGauge({
  value,
  min = 0,
  max,
  color,
  unit,
  decimals,
  label,
  alerts = [],
  containerStyle,
}: SingleGaugeProps) {
  return (
    <View style={[styles.singleWrap, containerStyle]}>
      {label ? <Text style={styles.singleLabel}>{label}</Text> : null}
      <HalfArc
        value={value}
        min={min}
        max={max}
        color={color}
        unit={unit}
        decimals={decimals}
        alerts={alerts}
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
      <View style={[styles.row, split && styles.rowSplit]}>
        <Pressable
          style={[styles.halfPressable, split && styles.halfPressableSplit]}
          onPress={() => router.push(routes.controlSpeed)}
          android_ripple={interaction.ripple}
        >
          <Sparkline
            points={speedSeries ?? []}
            color={telemetry.speed.color}
            height={28}
            range={{ min: 0, max: speedMax }}
            fmtMax={(v) => telemetry.speed.formatWithUnit(v)}
            maxPosition="left"
            windowMs={windowMs}
          />
          <QuarterArc
            side="left"
            value={speedValue}
            max={speedMax}
            color={telemetry.speed.color}
            unit="km/h"
            alerts={speedAlerts}
          />
        </Pressable>

        <Pressable
          style={[styles.halfPressable, split && styles.halfPressableSplit]}
          onPress={() => router.push(routes.controlDuty)}
          android_ripple={interaction.ripple}
        >
          <Sparkline
            points={dutySeries ?? []}
            color={telemetry.duty.color}
            height={28}
            range={{ min: 0, max: dutyMax }}
            fmtMax={(v) => telemetry.duty.formatWithUnit(v)}
            windowMs={windowMs}
          />
          <QuarterArc
            side="right"
            value={dutyValue}
            max={dutyMax}
            color={telemetry.duty.color}
            unit="%"
            alerts={dutyAlerts}
          />
        </Pressable>
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
  row: {
    flexDirection: 'row',
    gap: 32,
  },
  rowSplit: {
    justifyContent: 'space-between',
  },
  halfPressableSplit: {
    flex: 4,
  },
  quarterWrap: {
    width: '100%',
    aspectRatio: VB_CROP_W / VB_CROP_H,
    position: 'relative',
  },
  halfWrap: {
    width: '100%',
    aspectRatio: HALF_VB_W / HALF_VB_H,
    position: 'relative',
  },
  svg: {
    width: '100%',
    height: '100%',
  },
  bowlLeft: {
    position: 'absolute',
    right: 0,
    left: '5%',
    top: '10%',
    bottom: '5%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bowlRight: {
    position: 'absolute',
    left: 0,
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
  singleWrap: {
    backgroundColor: theme.neutral.surface,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 6,
    overflow: 'hidden',
  },
  singleLabel: {
    color: theme.neutral.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  halfBowl: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    top: '36%',
    bottom: '4%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  halfValue: {
    color: theme.neutral.textPrimary,
    fontSize: 52,
    fontFamily: 'monospace',
    fontWeight: '700',
    lineHeight: 58,
    padding: 0,
    textAlign: 'center',
  },
  halfUnit: {
    color: theme.neutral.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
})
