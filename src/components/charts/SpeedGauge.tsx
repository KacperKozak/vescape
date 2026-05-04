import { StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

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
const STROKE = 12

/** Project fraction f (0..1) along the half-circle to (x, y) on the arc. */
function arcPoint(f: number) {
  const angle = Math.PI - Math.PI * f // π → 0, sweeping through π/2 (top)
  return { x: CX + R * Math.cos(angle), y: CY - R * Math.sin(angle) }
}

function arcPath(f: number) {
  const end = arcPoint(Math.min(1, Math.max(0, f)))
  return `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`
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
          {/* Background arc (full half-circle) */}
          <Path
            d={arcPath(1)}
            stroke="#334155"
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
          />
          {/* Filled arc up to current speed */}
          {value != null && fraction > 0 ? (
            <Path
              d={arcPath(fraction)}
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
            />
          ) : null}
        </Svg>

        {/* Tick labels at start/end of dial */}
        <Text style={[styles.tick, styles.tickLeft]}>0</Text>
        <Text style={[styles.tick, styles.tickRight]}>{max}</Text>

        {/* Centered stack — speed, unit, GPS readout — sits in the bowl. */}
        <View style={styles.bowl} pointerEvents="none">
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {value != null ? value.toFixed(1) : '—'}
          </Text>
          <Text style={styles.unit}>km/h</Text>
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
  unit: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '500',
    marginTop: -4,
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
  tick: {
    position: 'absolute',
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tickLeft: {
    left: '6%',
    bottom: '8%',
  },
  tickRight: {
    right: '6%',
    bottom: '8%',
  },
  sparkRow: {
    width: '100%',
    marginTop: 4,
  },
})
