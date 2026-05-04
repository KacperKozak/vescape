import { StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { theme } from '@/constants/theme'

interface Props {
  /** Current VESC speed in km/h. */
  value: number | null
  /** Last-10-min VESC speed series — drawn under the dial. */
  series?: SparklinePoint[]
  /** GPS speed in km/h, shown as tiny secondary readout under the number. */
  gpsValue?: number | null
  /** Total odometer distance, pre-formatted (e.g. "0.21 km"). Top-right corner. */
  distance?: string
  /** Max gauge value. Defaults to 50 km/h. */
  max?: number
}

// 180° dial. ViewBox 200×120, center (100, 100), radius 80.
// Arc draws across the top half; the lower bowl is empty space we fill with
// the speed number and a small GPS readout.
const VB_W = 200
const VB_H = 120
const CX = 100
const CY = 100
const R = 80
const STROKE_BG = 2
const STROKE_FILL = 2
const GLOW_GRADIENT_ID = 'speedGaugeGlow'

/** Polar → cartesian on the dial circle at radius `r`. */
function polar(r: number, f: number) {
  const angle = Math.PI - Math.PI * f // π → 0, sweeping through π/2 (top)
  return { x: CX + r * Math.cos(angle), y: CY - r * Math.sin(angle) }
}

/** Project fraction f (0..1) along the half-circle to (x, y) on the arc. */
function arcPoint(f: number) {
  return polar(R, f)
}

function arcPath(f: number) {
  const end = arcPoint(Math.min(1, Math.max(0, f)))
  return `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`
}

/**
 * Pie-wedge from the dial center out to the active arc. Used as the canvas
 * for the inner glow — fill it with a radial gradient that's transparent
 * at the center and glows toward the arc edge.
 */
function wedgePath(f: number) {
  const clamped = Math.min(1, Math.max(0, f))
  if (clamped <= 0) return ''
  const end = arcPoint(clamped)
  return `M ${CX} ${CY} L ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${end.x} ${end.y} Z`
}

/**
 * Half-circle speedometer. VESC speed centered in the bowl, GPS speed below
 * it for cross-check, total distance tucked in the top-right, and a 10-min
 * sparkline under the dial.
 */
export function SpeedGauge({ value, series, gpsValue, distance, max = 50 }: Props) {
  const v = value ?? 0
  const fraction = Math.min(1, Math.max(0, v / max))
  const color = fraction > 0.85 ? theme.error.color : theme.wheel.color

  return (
    <View style={styles.wrap}>
      {distance ? (
        <View style={styles.distanceCorner} pointerEvents="none">
          <Text style={styles.distanceLabel}>TOTAL </Text>
          <Text style={styles.distanceValue}>{distance}</Text>
        </View>
      ) : null}

      <View style={styles.dial}>
        <Svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={styles.svg}>
          <Defs>
            {/* Inner glow — radial fade from transparent at the dial center
                out to a soft tint at the arc edge. Fills only the active
                wedge, so the glow tracks the current speed. */}
            <RadialGradient
              id={GLOW_GRADIENT_ID}
              gradientUnits="userSpaceOnUse"
              cx={CX}
              cy={CY}
              r={R}
            >
              <Stop offset="0" stopColor={color} stopOpacity={0} />
              <Stop offset="0.6" stopColor={color} stopOpacity={0} />
              <Stop offset="0.95" stopColor={color} stopOpacity={0.18} />
              <Stop offset="1" stopColor={color} stopOpacity={0.35} />
            </RadialGradient>
          </Defs>

          {/* Inner-glow wedge under the active arc */}
          {value != null && fraction > 0 ? (
            <Path d={wedgePath(fraction)} fill={`url(#${GLOW_GRADIENT_ID})`} stroke="none" />
          ) : null}

          {/* Background track — thin solid */}
          <Path
            d={arcPath(1)}
            stroke="#334155"
            strokeWidth={STROKE_BG}
            strokeLinecap="butt"
            fill="none"
          />

          {/* Active arc — thin solid colour, sits on top of the track */}
          {value != null && fraction > 0 ? (
            <Path
              d={arcPath(fraction)}
              stroke={color}
              strokeWidth={STROKE_FILL}
              strokeLinecap="butt"
              fill="none"
            />
          ) : null}

          {/* Marker: a thin radial tick on the outside of the arc, in the
              arc colour. Sits at the current-speed angle, just touching the
              track from outside. */}
          {value != null
            ? (() => {
                // Outer endpoint sits at the OUTER edge of the arc track
                // (R + half-stroke), not its center, so the tick top meets
                // the arc cleanly — no gap, no half-stuck-into-track look.
                const inner = polar(R - 10, fraction)
                const outer = polar(R + STROKE_FILL / 2, fraction)
                return (
                  <Line
                    x1={inner.x}
                    y1={inner.y}
                    x2={outer.x}
                    y2={outer.y}
                    stroke={color}
                    strokeWidth={1.5}
                    strokeLinecap="butt"
                  />
                )
              })()
            : null}
        </Svg>

        {/* Bottom row: range ticks (with units), one flex row so layout is
            reliable — absolute-positioned Text doesn't always size right. */}
        <View style={styles.tickRow} pointerEvents="none">
          <Text style={styles.tick}>
            0<Text style={styles.tickUnit}> km/h</Text>
          </Text>
          <Text style={styles.tick}>
            {max}
            <Text style={styles.tickUnit}> km/h</Text>
          </Text>
        </View>

        {/* Centered stack — big speed number + GPS readout. */}
        <View style={styles.bowl} pointerEvents="none">
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {value != null ? Math.round(value) : '—'}
          </Text>
          <Text style={styles.gpsText}>
            <Text style={styles.gpsLabel}>GPS </Text>
            {gpsValue != null ? `${gpsValue.toFixed(1)} km/h` : '—'}
          </Text>
        </View>
      </View>

      {/* 10-min speed sparkline. Built-in fmtMax matches the look of the
          smaller tiles (badge in line color, top-right). */}
      {series && series.length > 1 ? (
        <View style={styles.sparkRow}>
          <Sparkline
            points={series}
            color={color}
            height={28}
            range={{ min: 0, max }}
            fmtMax={(value) => `${value.toFixed(1)} km/h`}
          />
        </View>
      ) : null}
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
  dial: {
    width: '100%',
    aspectRatio: VB_W / VB_H,
    position: 'relative',
  },
  svg: {
    width: '100%',
    height: '100%',
  },
  /** Bowl: centers the value/unit/GPS stack inside the lower portion of the
   *  dial. Top inset skips the arc cap; flex centering handles the rest. */
  bowl: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '22%',
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: '#f1f5f9',
    fontSize: 56,
    fontFamily: 'monospace',
    fontWeight: '700',
    lineHeight: 60,
  },
  gpsText: {
    color: theme.gps.text,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '700',
    marginTop: 2,
  },
  gpsLabel: {
    color: '#64748b',
    fontWeight: '700',
  },
  tickRow: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: '4%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tick: {
    color: '#cbd5e1',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tickUnit: {
    color: '#64748b',
    fontWeight: '500',
  },
  sparkRow: {
    width: '100%',
    marginTop: 4,
  },
})
