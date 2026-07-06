import { type ReactNode, useCallback, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { Canvas, LinearGradient, Rect, RoundedRect, vec } from '@shopify/react-native-skia'

import { type DualGaugeAlert } from '@/components/ui/charts/DualGauge'
import { interaction, theme } from '@/constants/theme'

const TRACK_COLOR = theme.palette.slate.border
const LINE_THICK = 2
// Sizes mirror the gauge, expressed against the line thickness (gauge STROKE):
// alert tick 0.35× wide / 2× long, marker 1.5× wide. Marker length tracks bar height.
const TICK_W = LINE_THICK * 0.35
const TICK_LEN = LINE_THICK * 2
const MARKER_W = LINE_THICK * 1.5
const MARKER_RATIO = 0.5
const VALUE_GAP = 6
const BAR_H = 40
const BAR_H_COMPACT = 32

function clamp01(f: number) {
  return Math.min(1, Math.max(0, f))
}

function fractionOf(value: number, min: number, max: number) {
  const span = max - min
  if (span <= 0) return 0
  return clamp01((value - min) / span)
}

function useBarWidth() {
  const [width, setWidth] = useState(0)
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    setWidth((prev) => (prev === w ? prev : w))
  }, [])
  return { width, onLayout }
}

interface GaugeBarProps {
  width: number
  height: number
  fraction: number
  color: string
  alerts: DualGaugeAlert[]
  min: number
  max: number
}

function GaugeBar({ width, height, fraction, color, alerts, min, max }: GaugeBarProps) {
  // Line sits at the bottom (the "rim", like the gauge arc). Ticks/glow rise from it.
  const lineY = height - LINE_THICK
  const fillW = width * fraction
  const markerLen = height * MARKER_RATIO
  const bandH = height * 0.5

  return (
    <Canvas style={{ width, height }}>
      {/* Glow wedge — bounded to the head, brightest at the line, fading up (gauge glow ramp). */}
      {fillW > 0 ? (
        <Rect x={0} y={0} width={fillW} height={height}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={[
              theme.alpha(color, 0),
              theme.alpha(color, 0.12),
              theme.alpha(color, 0.12),
              theme.alpha(color, 0.3),
            ]}
            positions={[0, 0.35, 0.75, 1]}
          />
        </Rect>
      ) : null}

      {/* Full dim track line at the bottom */}
      <RoundedRect
        x={0}
        y={lineY}
        width={width}
        height={LINE_THICK}
        r={LINE_THICK / 2}
        color={TRACK_COLOR}
      />

      {/* Alert range bands — faint highlight tint hugging the line */}
      {alerts.map((a) => {
        if (a.thresholdMax == null) return null
        const from = fractionOf(a.threshold, min, max) * width
        const to = fractionOf(a.thresholdMax, min, max) * width
        if (to <= from) return null
        return (
          <Rect
            key={`band-${a.id}`}
            x={from}
            y={lineY - bandH}
            width={to - from}
            height={bandH + LINE_THICK}
            color={theme.alpha(theme.palette.yellow.color, 0.12)}
          />
        )
      })}

      {/* Colored progress line, 0 → head */}
      {fillW > 0 ? (
        <RoundedRect
          x={0}
          y={lineY}
          width={fillW}
          height={LINE_THICK}
          r={LINE_THICK / 2}
          color={color}
        />
      ) : null}

      {/* Alert ticks — tiny highlight marks just above the line (gauge AlertTick) */}
      {alerts.map((a) => {
        const ticks = [a.threshold, ...(a.thresholdMax == null ? [] : [a.thresholdMax])]
        return ticks.map((t, i) => (
          <Rect
            key={`tick-${a.id}-${i}`}
            x={fractionOf(t, min, max) * width - TICK_W / 2}
            y={lineY - TICK_LEN}
            width={TICK_W}
            height={TICK_LEN}
            color={theme.palette.yellow.color}
          />
        ))
      })}

      {/* Head marker at the current value — crosses the line, gauge marker proportions */}
      {fraction > 0 && fraction < 1 ? (
        <Rect
          x={fillW - MARKER_W / 2}
          y={lineY - markerLen}
          width={MARKER_W}
          height={markerLen + LINE_THICK}
          color={color}
        />
      ) : null}
    </Canvas>
  )
}

interface LinearGaugeProps {
  /** Current value, or null when unknown. */
  value: number | null
  min?: number
  max: number
  /** Stroke + value-text color (caller-resolved, e.g. low-battery warning). */
  color: string
  unit: string
  decimals?: number
  alerts?: DualGaugeAlert[]
  /** Secondary readout shown muted on the left (e.g. pack voltage). */
  aux?: ReactNode
  /** Shown when value is null. */
  hint?: string
  compact?: boolean
  transparent?: boolean
  containerStyle?: StyleProp<ViewStyle>
  onPress?: () => void
  testID?: string
}

export function LinearGauge({
  value,
  min = 0,
  max,
  color,
  unit,
  decimals = 0,
  alerts = [],
  aux,
  hint,
  compact,
  transparent,
  containerStyle,
  onPress,
  testID,
}: LinearGaugeProps) {
  const { width, onLayout } = useBarWidth()
  const height = compact ? BAR_H_COMPACT : BAR_H
  const fraction = value == null ? 0 : fractionOf(value, min, max)
  const valueText =
    value == null ? '—' : decimals === 0 ? Math.round(value).toString() : value.toFixed(decimals)

  // The value rides just left of the head, its top aligned with the head marker's top.
  const headX = width * fraction
  const valueSlotW = Math.max(0, headX - VALUE_GAP)
  const valueSlotTop = height - LINE_THICK - height * MARKER_RATIO

  const content = (
    <>
      <View style={[styles.barArea, { height }]} onLayout={onLayout}>
        {width > 0 ? (
          <GaugeBar
            width={width}
            height={height}
            fraction={fraction}
            color={color}
            alerts={alerts}
            min={min}
            max={max}
          />
        ) : null}
        {value != null && width > 0 ? (
          <View
            style={[styles.valueSlot, { width: valueSlotW, top: valueSlotTop }]}
            pointerEvents="none"
          >
            <Text
              style={[styles.value, compact && styles.valueCompact, { color }]}
              numberOfLines={1}
            >
              {valueText}
              <Text style={styles.unit}>{unit}</Text>
            </Text>
          </View>
        ) : null}
        {value == null && hint ? <Text style={styles.hintCenter}>{hint}</Text> : null}
      </View>
      {aux != null ? (
        <View style={styles.underRow}>
          {typeof aux === 'string' ? <Text style={styles.auxText}>{aux}</Text> : aux}
        </View>
      ) : null}
    </>
  )

  const style = [
    styles.wrap,
    compact && styles.wrapCompact,
    transparent && styles.wrapTransparent,
    containerStyle,
  ]

  if (!onPress) {
    return (
      <View testID={testID} style={style}>
        {content}
      </View>
    )
  }

  return (
    <Pressable onPress={onPress} android_ripple={interaction.ripple} testID={testID} style={style}>
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.palette.slate.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 4,
    marginBottom: 6,
    gap: 6,
  },
  wrapCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginHorizontal: 0,
    marginBottom: 0,
    gap: 4,
  },
  wrapTransparent: {
    backgroundColor: 'transparent',
  },
  barArea: {
    width: '100%',
    position: 'relative',
  },
  // Sits in [0, head − gap], right-aligned, so the value ends just left of the head marker.
  valueSlot: {
    position: 'absolute',
    left: 0,
    bottom: LINE_THICK,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  value: {
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: '700',
    lineHeight: 18,
  },
  valueCompact: {
    fontSize: 14,
    lineHeight: 16,
  },
  unit: {
    fontSize: 9,
    fontWeight: '500',
  },
  underRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -4,
  },
  auxText: {
    color: theme.palette.slate.textMuted,
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  hintCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: LINE_THICK,
    textAlignVertical: 'center',
    color: theme.palette.slate.textMuted,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
})
