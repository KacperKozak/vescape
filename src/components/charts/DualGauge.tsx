import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
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
  distance?: string
}

// Quarter-arc geometry constants
const VB_W = 110
const VB_H = 120
const R = 80
const STROKE = 2
const MARKER_INSET = 10

const GLOW_GRADIENT_ID_LEFT = 'dualGaugeGlowLeft'
const GLOW_GRADIENT_ID_RIGHT = 'dualGaugeGlowRight'
const ALERT_RANGE_GRADIENT_ID = 'dualGaugeAlertRangeLeft'

// Left arc center: (100, 100). Right arc center: (10, 100).
const LEFT_CX = 100
const LEFT_CY = 100
const RIGHT_CX = 10
const RIGHT_CY = 100

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

// Right arc: angle sweeps from π/2 (f=0) to 0 (f=1)
// polarRight(r, 0) → (10+80*cos(π/2), 100-80*sin(π/2)) = (10, 20)
// polarRight(r, 1) → (10+80*cos(0), 100-80*sin(0)) = (90, 100)
function polarRight(r: number, fraction: number) {
  'worklet'
  const angle = Math.PI / 2 - (Math.PI / 2) * fraction
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
  return `M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`
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
  return `M ${RIGHT_CX} ${RIGHT_CY} L ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y} Z`
}

function rangeWedgePathLeft(fromFraction: number, toFraction: number) {
  'worklet'
  const from = clamp01(fromFraction)
  const to = clamp01(toFraction)
  if (to <= from) return ''
  const radius = R - STROKE / 2
  const start = polarLeft(radius, from)
  const end = polarLeft(radius, to)
  return `M ${LEFT_CX} ${LEFT_CY} L ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y} Z`
}

// Precomputed static background arcs (full arc, f=1)
const BG_ARC_LEFT = arcPathLeft(1)
const BG_ARC_RIGHT = arcPathRight(1)

// ── Alert sub-components (left/speed side only) ──────────────────────────────

function AlertTick({ fraction }: { fraction: number }) {
  const inner = polarLeft(R - 3, fraction)
  const outer = polarLeft(R - STROKE / 2, fraction)
  return (
    <Line
      x1={inner.x}
      y1={inner.y}
      x2={outer.x}
      y2={outer.y}
      stroke="#facc15"
      strokeWidth={0.75}
      strokeLinecap="butt"
    />
  )
}

function AlertMarker({ alert, max }: { alert: DualGaugeAlert; max: number }) {
  const thresholdFraction = clamp01(alert.threshold / max)
  const maxFraction = alert.thresholdMax == null ? null : clamp01(alert.thresholdMax / max)
  const rangePath = maxFraction != null ? rangeWedgePathLeft(thresholdFraction, maxFraction) : ''

  if (maxFraction != null && rangePath) {
    return (
      <>
        <Path d={rangePath} fill={`url(#${ALERT_RANGE_GRADIENT_ID})`} stroke="none" />
        <AlertTick fraction={thresholdFraction} />
        <AlertTick fraction={maxFraction} />
      </>
    )
  }

  return <AlertTick fraction={thresholdFraction} />
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
      <Svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={styles.svg}>
        <Defs>
          <RadialGradient id={glowId} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={R}>
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="0.6" stopColor={color} stopOpacity={0} />
            <Stop offset="0.95" stopColor={color} stopOpacity={0.18} />
            <Stop offset="1" stopColor={color} stopOpacity={0.35} />
          </RadialGradient>
          {isLeft && (
            <RadialGradient
              id={ALERT_RANGE_GRADIENT_ID}
              gradientUnits="userSpaceOnUse"
              cx={LEFT_CX}
              cy={LEFT_CY}
              r={R}
            >
              <Stop offset="0" stopColor="#facc15" stopOpacity={0} />
              <Stop offset="0.82" stopColor="#facc15" stopOpacity={0} />
              <Stop offset="0.965" stopColor="#facc15" stopOpacity={0.05} />
              <Stop offset="0.99" stopColor="#facc15" stopOpacity={0.1} />
              <Stop offset="1" stopColor="#facc15" stopOpacity={0} />
            </RadialGradient>
          )}
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

        {/* Alert markers (left/speed side only) */}
        {isLeft && alerts.map((alert) => <AlertMarker key={alert.id} alert={alert} max={max} />)}

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

      {/* Tick labels */}
      {isLeft ? (
        <>
          <Text style={[styles.tick, styles.tickBottomLeft]} pointerEvents="none">
            0
          </Text>
          <Text style={[styles.tick, styles.tickTopRight]} pointerEvents="none">
            {max}
          </Text>
        </>
      ) : (
        <>
          <Text style={[styles.tick, styles.tickTopLeft]} pointerEvents="none">
            {max}
          </Text>
          <Text style={[styles.tick, styles.tickBottomRight]} pointerEvents="none">
            0
          </Text>
        </>
      )}
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
  distance,
}: DualGaugeProps) {
  const router = useRouter()

  return (
    <View style={styles.wrap}>
      {distance ? (
        <View style={styles.distanceCorner} pointerEvents="none">
          <Text style={styles.distanceLabel}>TOTAL </Text>
          <Text style={styles.distanceValue}>{distance}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row' }}>
        <Pressable
          style={styles.halfPressable}
          onPress={() => router.push(routes.controlSpeed)}
          android_ripple={{ color: 'rgba(148,163,184,0.18)', borderless: false, foreground: true }}
        >
          <QuarterArc
            side="left"
            value={speedValue}
            max={speedMax}
            color={telemetry.speed.color}
            unit="km/h"
            alerts={speedAlerts}
          />
          {speedSeries && speedSeries.length > 1 && (
            <Sparkline
              points={speedSeries}
              color={telemetry.speed.color}
              height={28}
              range={{ min: 0, max: speedMax }}
              fmtMax={(v) => telemetry.speed.formatWithUnit(v)}
              windowMs={windowMs}
            />
          )}
        </Pressable>

        <Pressable
          style={styles.halfPressable}
          onPress={() => router.push(routes.controlDuty)}
          android_ripple={{ color: 'rgba(148,163,184,0.18)', borderless: false, foreground: true }}
        >
          <QuarterArc
            side="right"
            value={dutyValue}
            max={dutyMax}
            color={telemetry.duty.color}
            unit="%"
          />
          {dutySeries && dutySeries.length > 1 && (
            <Sparkline
              points={dutySeries}
              color={telemetry.duty.color}
              height={28}
              range={{ min: 0, max: dutyMax }}
              fmtMax={(v) => telemetry.duty.formatWithUnit(v)}
              windowMs={windowMs}
            />
          )}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 4,
    marginBottom: 6,
    position: 'relative',
  },
  distanceCorner: {
    position: 'absolute',
    top: 12,
    right: 14,
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  distanceLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  distanceValue: {
    color: '#cbd5e1',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  halfPressable: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 8,
  },
  quarterWrap: {
    width: '100%',
    aspectRatio: VB_W / VB_H,
    position: 'relative',
  },
  svg: {
    width: '100%',
    height: '100%',
  },
  bowlLeft: {
    position: 'absolute',
    // Anchor to the bottom-right area of the left arc (arc ends at top-center of viewBox)
    right: 0,
    left: '20%',
    top: '10%',
    bottom: '10%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bowlRight: {
    position: 'absolute',
    // Anchor to the bottom-left area of the right arc (arc ends at top-center of viewBox)
    left: 0,
    right: '20%',
    top: '10%',
    bottom: '10%',
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
  tick: {
    position: 'absolute',
    color: '#cbd5e1',
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  // Left side ticks
  tickBottomLeft: {
    bottom: '4%',
    left: '4%',
  },
  tickTopRight: {
    top: '4%',
    right: '4%',
  },
  // Right side ticks
  tickTopLeft: {
    top: '4%',
    left: '4%',
  },
  tickBottomRight: {
    bottom: '4%',
    right: '4%',
  },
})
