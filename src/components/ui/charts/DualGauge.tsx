import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { type ReactNode, useCallback, useMemo, useState } from 'react'
import Animated, {
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import {
  Canvas,
  Group,
  Path,
  RadialGradient,
  Skia,
  vec,
  type SkPath,
} from '@shopify/react-native-skia'

import { Sparkline, type SparklinePoint } from '@/components/ui/charts/Sparkline'
import { telemetry } from '@/constants/telemetry'
import { interaction, theme } from '@/constants/theme'
import { getHistoryMetricHotRange, type MetricHotRange } from '@/lib/history/metricColorScale'
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
  speedHotRange?: MetricHotRange | null
  dutyHotRange?: MetricHotRange | null
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
  hotRange?: MetricHotRange | null
  containerStyle?: StyleProp<ViewStyle>
}

// Quarter-arc geometry constants
const VB_H = 120
const R = 80
const STROKE = 1
const MARKER_INSET = 10

const BG_ARC_COLOR = '#334155'
const GAUGE_HOT_COLOR = theme.error.color

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

/** Bake a 0–1 alpha into a 6-digit hex color → 8-digit #RRGGBBAA. */
function alpha(hex: string, a: number) {
  'worklet'
  const clamped = Math.min(1, Math.max(0, a))
  return `${hex}${Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0')}`
}

function clamp01(f: number) {
  'worklet'
  return Math.min(1, Math.max(0, f))
}

function gaugeRampColor(
  current: number | null,
  baseColor: string,
  hotRange: MetricHotRange | null | undefined,
) {
  'worklet'
  if (current == null || hotRange == null) return baseColor
  const start = Math.min(hotRange.start, hotRange.end)
  const end = Math.max(hotRange.start, hotRange.end)
  const span = end - start
  const fraction = span <= 0 ? 0 : clamp01((current - start) / span)
  return interpolateColor(fraction, [0, 1], [baseColor, GAUGE_HOT_COLOR])
}

// Left arc: angle sweeps from π (f=0) to π/2 (f=1)
function polarLeft(r: number, fraction: number) {
  'worklet'
  const angle = Math.PI - (Math.PI / 2) * fraction
  return { x: LEFT_CX + r * Math.cos(angle), y: LEFT_CY - r * Math.sin(angle) }
}

// Right arc: angle sweeps from 0 (f=0) to π/2 (f=1)
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

// ── Skia helpers ─────────────────────────────────────────────────────────────

/** Build an SkPath from an SVG path string (worklet-safe), never null. */
function svgPath(d: string): SkPath {
  'worklet'
  return Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make()
}

/** Single straight segment as an SkPath. */
function segmentPath(x1: number, y1: number, x2: number, y2: number): SkPath {
  'worklet'
  const p = Skia.Path.Make()
  p.moveTo(x1, y1)
  p.lineTo(x2, y2)
  return p
}

// Precomputed static background arcs (full arc, f=1)
const BG_ARC_LEFT = svgPath(arcPathLeft(1))
const BG_ARC_RIGHT = svgPath(arcPathRight(1))

// ── Alert sub-components ──────────────────────────────────────────────────────

const TICK_LENGHT = 2
const TICK_WIDTH = 0.35

interface AlertTickProps {
  side: 'left' | 'right'
  fraction: number
}

function AlertTick({ side, fraction }: AlertTickProps) {
  const path = useMemo(() => {
    const inner =
      side === 'left' ? polarLeft(R - TICK_LENGHT, fraction) : polarRight(R - TICK_LENGHT, fraction)
    const outer =
      side === 'left' ? polarLeft(R - STROKE / 2, fraction) : polarRight(R - STROKE / 2, fraction)
    return segmentPath(inner.x, inner.y, outer.x, outer.y)
  }, [side, fraction])

  return (
    <Path
      path={path}
      color={theme.highlight.color}
      style="stroke"
      strokeWidth={TICK_WIDTH}
      strokeCap="butt"
    />
  )
}

interface AlertMarkerProps {
  side: 'left' | 'right'
  alert: DualGaugeAlert
  max: number
  cx: number
  cy: number
}

function AlertMarker({ side, alert, max, cx, cy }: AlertMarkerProps) {
  const thresholdFraction = clamp01(alert.threshold / max)
  const maxFraction = alert.thresholdMax == null ? null : clamp01(alert.thresholdMax / max)
  const rangePath = useMemo(() => {
    if (maxFraction == null) return null
    const d =
      side === 'left'
        ? rangeWedgePathLeft(thresholdFraction, maxFraction)
        : rangeWedgePathRight(thresholdFraction, maxFraction)
    return d ? Skia.Path.MakeFromSVGString(d) : null
  }, [side, thresholdFraction, maxFraction])

  if (maxFraction != null && rangePath) {
    return (
      <>
        <Path path={rangePath}>
          <AlertRangeGradient cx={cx} cy={cy} r={R} />
        </Path>
        <AlertTick side={side} fraction={thresholdFraction} />
        <AlertTick side={side} fraction={maxFraction} />
      </>
    )
  }

  return <AlertTick side={side} fraction={thresholdFraction} />
}

// ── Gradients ────────────────────────────────────────────────────────────────

interface GlowGradientProps {
  color: string
  cx: number
  cy: number
  r: number
  /** Stop offsets + opacities, matching the SVG RadialGradient stops. */
  stops: number[]
  opacities: number[]
}

function GlowGradient({ color, cx, cy, r, stops, opacities }: GlowGradientProps) {
  const colors = useMemo(() => opacities.map((o) => alpha(color, o)), [color, opacities])
  return <RadialGradient c={vec(cx, cy)} r={r} colors={colors} positions={stops} />
}

const ALERT_STOPS = [0, 0.82, 0.965, 0.99, 1]
const ALERT_OPACITIES = [0, 0, 0.05, 0.1, 0]

function AlertRangeGradient({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const colors = useMemo(() => ALERT_OPACITIES.map((o) => alpha(theme.highlight.color, o)), [])
  return <RadialGradient c={vec(cx, cy)} r={r} colors={colors} positions={ALERT_STOPS} />
}

const QUARTER_GLOW_STOPS = [0, 0.6, 0.95, 1]
const QUARTER_GLOW_OPACITIES = [0, 0, 0.18, 0.35]

// ── HalfArc sub-component ───────────────────────────────────────────────────

const HALF_CX = 100
const HALF_CY = 100
const HALF_R = 88
const HALF_VB_W = 200
const HALF_VB_H = 112
const HALF_GLOW_STOPS = [0, 0.58, 0.94, 1]
const HALF_GLOW_OPACITIES = [0, 0, 0.2, 0.38]
const HALF_ALERT_STOPS = [0, 0.82, 0.965, 0.99, 1]
const HALF_ALERT_OPACITIES = [0, 0, 0.06, 0.12, 0]

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

const HALF_BG_ARC = svgPath(halfArcPath(1))

interface HalfAlertTickProps {
  fraction: number
}

function HalfAlertTick({ fraction }: HalfAlertTickProps) {
  const path = useMemo(() => {
    const inner = polarHalf(HALF_R - TICK_LENGHT, fraction)
    const outer = polarHalf(HALF_R - STROKE / 2, fraction)
    return segmentPath(inner.x, inner.y, outer.x, outer.y)
  }, [fraction])

  return (
    <Path
      path={path}
      color={theme.highlight.color}
      style="stroke"
      strokeWidth={TICK_WIDTH}
      strokeCap="butt"
    />
  )
}

interface HalfAlertMarkerProps {
  alert: DualGaugeAlert
  min: number
  max: number
}

function HalfAlertMarker({ alert, min, max }: HalfAlertMarkerProps) {
  const thresholdFraction = normalizeFraction(alert.threshold, min, max)
  const maxFraction =
    alert.thresholdMax == null ? null : normalizeFraction(alert.thresholdMax, min, max)
  const rangePath = useMemo(() => {
    if (maxFraction == null) return null
    const d = halfRangeWedgePath(thresholdFraction, maxFraction)
    return d ? Skia.Path.MakeFromSVGString(d) : null
  }, [thresholdFraction, maxFraction])

  if (maxFraction != null && rangePath) {
    return (
      <>
        <Path path={rangePath}>
          <RadialGradient
            c={vec(HALF_CX, HALF_CY)}
            r={HALF_R}
            colors={HALF_ALERT_OPACITIES.map((o) => alpha(theme.highlight.color, o))}
            positions={HALF_ALERT_STOPS}
          />
        </Path>
        <HalfAlertTick fraction={thresholdFraction} />
        <HalfAlertTick fraction={maxFraction} />
      </>
    )
  }

  return <HalfAlertTick fraction={thresholdFraction} />
}

function useCanvasSize() {
  const [size, setSize] = useState({ w: 0, h: 0 })
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }))
  }, [])
  return { size, onLayout }
}

function HalfArc({
  value,
  min,
  max,
  color,
  unit,
  decimals = 0,
  alerts = [],
  hotRange,
}: Required<Pick<SingleGaugeProps, 'value' | 'min' | 'max' | 'color' | 'unit'>> &
  Pick<SingleGaugeProps, 'decimals' | 'alerts' | 'hotRange'>) {
  const { size, onLayout } = useCanvasSize()
  const scale = size.w > 0 ? size.w / HALF_VB_W : 0

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

  const arcPath = useDerivedValue(() =>
    svgPath(halfArcPath(normalizeFraction(value.value ?? min, min, max))),
  )
  const arcColor = useDerivedValue(() => gaugeRampColor(value.value ?? min, color, hotRange))
  const wedgePath = useDerivedValue(() =>
    svgPath(halfWedgePath(normalizeFraction(value.value ?? min, min, max))),
  )
  const markerPath = useDerivedValue(() => {
    const fraction = normalizeFraction(value.value ?? min, min, max)
    const inner = polarHalf(HALF_R - MARKER_INSET, fraction)
    const outer = polarHalf(HALF_R + STROKE / 2, fraction)
    return segmentPath(inner.x, inner.y, outer.x, outer.y)
  })

  const animatedValueStyle = useAnimatedStyle(() => {
    return { color: gaugeRampColor(value.value, color, hotRange) }
  })

  return (
    <View style={styles.halfWrap}>
      <View style={styles.svg} onLayout={onLayout}>
        {scale > 0 ? (
          <Canvas style={styles.svg}>
            <Group transform={[{ scale }]}>
              <Path path={wedgePath}>
                <GlowGradient
                  color={color}
                  cx={HALF_CX}
                  cy={HALF_CY}
                  r={HALF_R}
                  stops={HALF_GLOW_STOPS}
                  opacities={HALF_GLOW_OPACITIES}
                />
              </Path>
              <Path
                path={HALF_BG_ARC}
                color={BG_ARC_COLOR}
                style="stroke"
                strokeWidth={STROKE}
                strokeCap="butt"
              />
              <Path
                path={arcPath}
                color={arcColor}
                style="stroke"
                strokeWidth={STROKE}
                strokeCap="butt"
              />
              {alerts.map((alert) => (
                <HalfAlertMarker key={alert.id} alert={alert} min={min} max={max} />
              ))}
              <Path
                path={markerPath}
                color={arcColor}
                style="stroke"
                strokeWidth={1.7}
                strokeCap="butt"
              />
            </Group>
          </Canvas>
        ) : null}
      </View>

      <View style={styles.halfBowl} pointerEvents="none">
        <AnimatedTextInput
          editable={false}
          animatedProps={animatedValueProps}
          style={[styles.halfValue, animatedValueStyle]}
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
  hotRange?: MetricHotRange | null
}

function QuarterArc({ side, value, max, color, unit, alerts = [], hotRange }: QuarterArcProps) {
  const isLeft = side === 'left'
  const cx = isLeft ? LEFT_CX : RIGHT_CX
  const cy = isLeft ? LEFT_CY : RIGHT_CY
  const originX = isLeft ? VB_CROP_LEFT_X : VB_CROP_RIGHT_X

  const { size, onLayout } = useCanvasSize()
  const scale = size.w > 0 ? size.w / VB_CROP_W : 0
  const transform = useMemo(
    () => [{ translateX: -originX * scale }, { translateY: -CROP_TOP * scale }, { scale }],
    [originX, scale],
  )

  const animatedValueProps = useAnimatedProps(() => {
    const current = value.value
    const text = current != null ? Math.round(current).toString() : '—'
    return { text, value: text }
  })

  const arcPath = useDerivedValue(() => {
    const f = clamp01((value.value ?? 0) / max)
    return svgPath(isLeft ? arcPathLeft(f) : arcPathRight(f))
  })
  const arcColor = useDerivedValue(() => gaugeRampColor(value.value ?? 0, color, hotRange))
  const wedgePath = useDerivedValue(() => {
    const f = clamp01((value.value ?? 0) / max)
    return svgPath(isLeft ? wedgePathLeft(f) : wedgePathRight(f))
  })
  const markerPath = useDerivedValue(() => {
    const fraction = clamp01((value.value ?? 0) / max)
    const inner = isLeft
      ? polarLeft(R - MARKER_INSET, fraction)
      : polarRight(R - MARKER_INSET, fraction)
    const outer = isLeft
      ? polarLeft(R + STROKE / 2, fraction)
      : polarRight(R + STROKE / 2, fraction)
    return segmentPath(inner.x, inner.y, outer.x, outer.y)
  })

  const animatedValueStyle = useAnimatedStyle(() => {
    return { color: gaugeRampColor(value.value, color, hotRange) }
  })

  const bgArc = isLeft ? BG_ARC_LEFT : BG_ARC_RIGHT

  return (
    <View style={styles.quarterWrap}>
      <View style={styles.svg} onLayout={onLayout}>
        {scale > 0 ? (
          <Canvas style={styles.svg}>
            <Group transform={transform}>
              {/* Gradient wedge fill */}
              <Path path={wedgePath}>
                <GlowGradient
                  color={color}
                  cx={cx}
                  cy={cy}
                  r={R}
                  stops={QUARTER_GLOW_STOPS}
                  opacities={QUARTER_GLOW_OPACITIES}
                />
              </Path>

              {/* Static background arc */}
              <Path
                path={bgArc}
                color={BG_ARC_COLOR}
                style="stroke"
                strokeWidth={STROKE}
                strokeCap="butt"
              />

              {/* Animated colored arc overlay */}
              <Path
                path={arcPath}
                color={arcColor}
                style="stroke"
                strokeWidth={STROKE}
                strokeCap="butt"
              />

              {/* Alert markers */}
              {alerts.map((alert) => (
                <AlertMarker key={alert.id} side={side} alert={alert} max={max} cx={cx} cy={cy} />
              ))}

              {/* Position marker */}
              <Path
                path={markerPath}
                color={arcColor}
                style="stroke"
                strokeWidth={1.5}
                strokeCap="butt"
              />
            </Group>
          </Canvas>
        ) : null}
      </View>

      {/* Value bowl — absolutely positioned over the canvas */}
      <View style={isLeft ? styles.bowlLeft : styles.bowlRight} pointerEvents="none">
        <AnimatedTextInput
          editable={false}
          animatedProps={animatedValueProps}
          style={[styles.value, animatedValueStyle]}
        />
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  )
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

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
  hotRange,
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
        hotRange={hotRange}
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
            hotRange={speedHotRange}
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
            hotRange={dutyHotRange}
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
