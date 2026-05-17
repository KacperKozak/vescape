import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { type ReactNode } from 'react'
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import Svg, { Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { telemetry } from '@/constants/telemetry'
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

// Quarter-arc geometry constants
const VB_W = 110
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

function AlertTick({ side, fraction }: { side: 'left' | 'right'; fraction: number }) {
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
      stroke="#facc15"
      strokeWidth={TICK_WIDTH}
      strokeLinecap="butt"
    />
  )
}

function AlertMarker({
  side,
  alert,
  max,
}: {
  side: 'left' | 'right'
  alert: DualGaugeAlert
  max: number
}) {
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
            <Stop offset="0" stopColor="#facc15" stopOpacity={0} />
            <Stop offset="0.82" stopColor="#facc15" stopOpacity={0} />
            <Stop offset="0.965" stopColor="#facc15" stopOpacity={0.05} />
            <Stop offset="0.99" stopColor="#facc15" stopOpacity={0.1} />
            <Stop offset="1" stopColor="#facc15" stopOpacity={0} />
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
          android_ripple={{ color: 'rgba(148,163,184,0.18)', borderless: false, foreground: true }}
        >
          <Sparkline
            points={speedSeries ?? []}
            color={telemetry.speed.color}
            height={28}
            range={{ min: 0, max: speedMax }}
            fmtMax={(v) => telemetry.speed.formatWithUnit(v)}
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
          android_ripple={{ color: 'rgba(148,163,184,0.18)', borderless: false, foreground: true }}
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
    backgroundColor: '#1e293b',
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
    color: '#f1f5f9',
    fontSize: 36,
    fontFamily: 'monospace',
    fontWeight: '700',
    lineHeight: 40,
    padding: 0,
    textAlign: 'center',
  },
  unit: {
    color: '#64748b',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
})
