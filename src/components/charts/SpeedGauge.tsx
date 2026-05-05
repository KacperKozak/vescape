import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { theme } from '@/constants/theme'
import { fmtSpeed } from '@/helpers/format'

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
  alerts?: SpeedGaugeAlert[]
}

export interface SpeedGaugeAlert {
  id: string
  threshold: number
  thresholdMax: number | null
}

// 180° dial. ViewBox 200×120, center (100, 100), radius 80.
const VB_W = 200
const VB_H = 120
const CX = 100
const CY = 100
const R = 80
const STROKE = 2
const MARKER_INSET = 10
const RED_FRACTION = 0.85
const GLOW_GRADIENT_ID = 'speedGaugeGlow'
const ALERT_RANGE_GLOW_GRADIENT_ID = 'speedGaugeAlertRangeGlow'
const SPARK_RANGE = { min: 0, max: 50 } // overridden below if `max` differs

function clamp01(f: number) {
  return Math.min(1, Math.max(0, f))
}

function polar(r: number, f: number) {
  const angle = Math.PI - Math.PI * f // π → 0, sweeping through π/2 (top)
  return { x: CX + r * Math.cos(angle), y: CY - r * Math.sin(angle) }
}

function arcPath(f: number) {
  const end = polar(R, clamp01(f))
  return `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`
}

function wedgePath(f: number) {
  const c = clamp01(f)
  if (c <= 0) return ''
  const end = polar(R, c)
  return `M ${CX} ${CY} L ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${end.x} ${end.y} Z`
}

function rangeWedgePath(fromFraction: number, toFraction: number) {
  const from = clamp01(fromFraction)
  const to = clamp01(toFraction)
  if (to <= from) return ''
  const radius = R - STROKE / 2
  const start = polar(radius, from)
  const end = polar(radius, to)
  return `M ${CX} ${CY} L ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y} Z`
}

// Background track is constant — draw it once at module load, not per render.
const BG_ARC_PATH = arcPath(1)

function fmtSpeedWithUnit(value: number) {
  return `${fmtSpeed(value)} km/h`
}

/**
 * Half-circle speedometer. VESC speed centered in the bowl, GPS speed below
 * it for cross-check, total distance tucked in the top-right, and a 10-min
 * sparkline under the dial.
 */
export function SpeedGauge({ value, series, gpsValue, distance, max = 50, alerts = [] }: Props) {
  const fraction = clamp01((value ?? 0) / max)
  const color = fraction > RED_FRACTION ? theme.error.color : theme.wheel.color

  const activeArc = useMemo(() => arcPath(fraction), [fraction])
  const wedge = useMemo(() => wedgePath(fraction), [fraction])
  const sparkRange = useMemo(() => (max === SPARK_RANGE.max ? SPARK_RANGE : { min: 0, max }), [max])

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
            <RadialGradient
              id={ALERT_RANGE_GLOW_GRADIENT_ID}
              gradientUnits="userSpaceOnUse"
              cx={CX}
              cy={CY}
              r={R}
            >
              <Stop offset="0" stopColor="#facc15" stopOpacity={0} />
              <Stop offset="0.82" stopColor="#facc15" stopOpacity={0} />
              <Stop offset="0.965" stopColor="#facc15" stopOpacity={0.05} />
              <Stop offset="0.99" stopColor="#facc15" stopOpacity={0.1} />
              <Stop offset="1" stopColor="#facc15" stopOpacity={0} />
            </RadialGradient>
          </Defs>

          {value != null && fraction > 0 ? (
            <Path d={wedge} fill={`url(#${GLOW_GRADIENT_ID})`} stroke="none" />
          ) : null}

          <Path
            d={BG_ARC_PATH}
            stroke="#334155"
            strokeWidth={STROKE}
            strokeLinecap="butt"
            fill="none"
          />

          {value != null && fraction > 0 ? (
            <Path
              d={activeArc}
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="butt"
              fill="none"
            />
          ) : null}

          {alerts.map((alert) => (
            <AlertMarker key={alert.id} alert={alert} max={max} />
          ))}

          {value != null ? <Marker fraction={fraction} color={color} /> : null}
        </Svg>

        <View style={styles.tickRow} pointerEvents="none">
          <Text style={styles.tick}>
            0<Text style={styles.tickUnit}> km/h</Text>
          </Text>
          <Text style={styles.tick}>
            {max}
            <Text style={styles.tickUnit}> km/h</Text>
          </Text>
        </View>

        <View style={styles.bowl} pointerEvents="none">
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {value != null ? Math.round(value) : '—'}
          </Text>
          <Text style={styles.gpsText}>
            <Text style={styles.gpsLabel}>GPS </Text>
            {gpsValue != null ? fmtSpeedWithUnit(gpsValue) : '—'}
          </Text>
        </View>
      </View>

      {series && series.length > 1 ? (
        <View style={styles.sparkRow}>
          <Sparkline
            points={series}
            color={color}
            height={28}
            range={sparkRange}
            fmtMax={fmtSpeedWithUnit}
          />
        </View>
      ) : null}
    </View>
  )
}

function AlertMarker({ alert, max }: { alert: SpeedGaugeAlert; max: number }) {
  const thresholdFraction = clamp01(alert.threshold / max)
  const maxFraction = alert.thresholdMax == null ? null : clamp01(alert.thresholdMax / max)
  const rangePath = maxFraction != null ? rangeWedgePath(thresholdFraction, maxFraction) : ''

  if (maxFraction != null && rangePath) {
    return (
      <>
        <Path d={rangePath} fill={`url(#${ALERT_RANGE_GLOW_GRADIENT_ID})`} stroke="none" />
        <AlertTick fraction={thresholdFraction} />
        <AlertTick fraction={maxFraction} />
      </>
    )
  }

  return <AlertTick fraction={thresholdFraction} />
}

function AlertTick({ fraction }: { fraction: number }) {
  const inner = polar(R - 3, fraction)
  const outer = polar(R - STROKE / 2, fraction)
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

/**
 * Marker tick on the outside of the arc. Outer endpoint sits at the OUTER
 * edge of the arc track (R + half-stroke), not its center, so the tick top
 * meets the arc cleanly — no gap, no half-stuck-into-track look.
 */
function Marker({ fraction, color }: { fraction: number; color: string }) {
  const inner = polar(R - MARKER_INSET, fraction)
  const outer = polar(R + STROKE / 2, fraction)
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
  /** Top inset skips the arc cap; flex centering handles the rest. */
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
  /** Absolute-positioned <Text> doesn't always size right; use a flex row. */
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
