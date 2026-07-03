import { useEffect, useMemo, useRef } from 'react'
import { StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { QuestionIcon } from 'phosphor-react-native'
import Svg, { Circle, G, Line } from 'react-native-svg'
import Animated, { useAnimatedProps, useSharedValue } from 'react-native-reanimated'
import type { TuneProfileFieldValue } from 'vesc-ble'

import { IconButton } from '@/components/ui/base/IconButton'
import { theme } from '@/constants/theme'
import {
  createTunePreviewModel,
  createTunePreviewState,
  groundTravelToVisualOffset,
  stepTunePreview,
} from '@/lib/tune/tunePreview'

interface TunePreviewProps {
  fields: Record<string, TuneProfileFieldValue>
  riderLean: number
  speedKmh: number
  active?: boolean
  onHelp: () => void
}

const GROUND_Y = 104
const WHEEL_RADIUS = 25
const DECK_HALF_LENGTH = 72
const DECK_CENTER_Y = GROUND_Y - WHEEL_RADIUS
const GROUND_TICK_SPACING = 30
const AnimatedLine = Animated.createAnimatedComponent(Line)
const AnimatedGroup = Animated.createAnimatedComponent(G)
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

export function TunePreview({
  fields,
  riderLean,
  speedKmh,
  active = true,
  onHelp,
}: TunePreviewProps) {
  const model = useMemo(() => createTunePreviewModel(fields), [fields])
  const { width: canvasWidth } = useWindowDimensions()
  const stateRef = useRef(createTunePreviewState())
  const lastTimestampRef = useRef<number | null>(null)
  const angleDegrees = useSharedValue(0)
  const targetAngleDegrees = useSharedValue(0)
  const groundOffset = useSharedValue(0)
  const centerX = canvasWidth / 2

  const deckAnimatedProps = useAnimatedProps(() => lineForAngle(angleDegrees.value, centerX))
  const targetAnimatedProps = useAnimatedProps(() =>
    lineForAngle(targetAngleDegrees.value, centerX),
  )
  const groundAnimatedProps = useAnimatedProps(() => ({
    transform: [{ translateX: groundOffset.value }],
  }))
  const angleTextAnimatedProps = useAnimatedProps(() => {
    const value = `${angleDegrees.value.toFixed(1)}°`
    return { text: value, value }
  })

  useEffect(() => {
    if (!active || model.status !== 'ready') {
      lastTimestampRef.current = null
      return
    }

    let frame = 0
    const tick = (timestamp: number) => {
      const previous = lastTimestampRef.current
      lastTimestampRef.current = timestamp
      if (previous != null) {
        const next = stepTunePreview(
          stateRef.current,
          model.parameters,
          { riderLean, speedKmh },
          (timestamp - previous) / 1000,
        )
        stateRef.current = next
        angleDegrees.value = next.angleDegrees
        targetAngleDegrees.value = next.targetAngleDegrees
        groundOffset.value = groundTravelToVisualOffset(next.groundTravelMeters)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      lastTimestampRef.current = null
    }
  }, [active, angleDegrees, groundOffset, model, riderLean, speedKmh, targetAngleDegrees])

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Tune Preview</Text>
          <Text style={styles.subtitle}>
            Comparative ideal response · {speedKmh.toFixed(0)} km/h
          </Text>
          {model.status === 'ready' && model.assumedFields.length > 0 ? (
            <Text style={styles.assumption}>Bundled Tiltback thresholds</Text>
          ) : null}
        </View>
        <IconButton icon={QuestionIcon} onPress={onHelp} />
      </View>

      {model.status === 'unsupported' ? (
        <View style={styles.unsupported}>
          <Text style={styles.unsupportedTitle}>Preview unavailable</Text>
          <Text style={styles.unsupportedText}>Missing: {model.missingFields.join(', ')}</Text>
        </View>
      ) : (
        <>
          <Svg
            width="100%"
            height={122}
            viewBox={`0 0 ${canvasWidth} 122`}
            accessibilityLabel="Board angle preview"
          >
            <AnimatedLine
              animatedProps={targetAnimatedProps}
              stroke={theme.palette.purple.light}
              strokeWidth={1}
              strokeDasharray="6 5"
            />
            <AnimatedLine
              animatedProps={deckAnimatedProps}
              stroke={theme.palette.sky.color}
              strokeWidth={1}
              strokeLinecap="round"
            />
            <Circle
              cx={centerX}
              cy={GROUND_Y - WHEEL_RADIUS}
              r={WHEEL_RADIUS}
              fill={theme.palette.slate.surfaceDeep}
              stroke={theme.palette.slate.textSecondary}
              strokeWidth={1}
            />
            <AnimatedGroup animatedProps={groundAnimatedProps}>
              {groundTicks(canvasWidth).map((x, index) => (
                <Line
                  key={index}
                  x1={x}
                  y1={GROUND_Y}
                  x2={x - 4}
                  y2={GROUND_Y + 6}
                  stroke={theme.palette.slate.textMuted}
                  strokeWidth={1}
                />
              ))}
            </AnimatedGroup>
            <Circle
              cx={centerX}
              cy={GROUND_Y - WHEEL_RADIUS}
              r={4}
              fill={theme.palette.slate.textSecondary}
            />
            <Line
              x1={0}
              y1={GROUND_Y}
              x2={canvasWidth}
              y2={GROUND_Y}
              stroke={theme.palette.slate.textMuted}
              strokeWidth={1}
            />
          </Svg>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={styles.boardSwatch} />
              <Text style={styles.legendText}>Board</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.targetSwatch} />
              <Text style={styles.legendText}>Target</Text>
            </View>
            <AnimatedTextInput
              editable={false}
              defaultValue="0.0°"
              animatedProps={angleTextAnimatedProps}
              style={styles.angle}
            />
          </View>
        </>
      )}
    </View>
  )
}

function lineForAngle(angleDegrees: number, centerX: number) {
  'worklet'
  const radians = (-angleDegrees * Math.PI) / 180
  const dx = Math.cos(radians) * DECK_HALF_LENGTH
  const dy = Math.sin(radians) * DECK_HALF_LENGTH
  return { x1: centerX - dx, y1: DECK_CENTER_Y - dy, x2: centerX + dx, y2: DECK_CENTER_Y + dy }
}

function groundTicks(canvasWidth: number): number[] {
  return Array.from(
    { length: Math.ceil(canvasWidth / GROUND_TICK_SPACING) + 1 },
    (_, index) => index * GROUND_TICK_SPACING,
  )
}

const styles = StyleSheet.create({
  card: {},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  title: { color: theme.palette.slate.textPrimary, fontSize: 14, fontWeight: '900' },
  subtitle: { color: theme.palette.slate.textMuted, fontSize: 10, fontWeight: '600', marginTop: 2 },
  assumption: { color: theme.palette.amber.text, fontSize: 9, fontWeight: '700', marginTop: 2 },
  unsupported: { height: 122, alignItems: 'center', justifyContent: 'center', gap: 5 },
  unsupportedTitle: { color: theme.palette.slate.textPrimary, fontSize: 13, fontWeight: '800' },
  unsupportedText: { color: theme.palette.slate.textMuted, fontSize: 11 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  boardSwatch: { width: 18, height: 3, backgroundColor: theme.palette.sky.color },
  targetSwatch: {
    width: 18,
    height: 1,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.palette.purple.light,
  },
  legendText: { color: theme.palette.slate.textMuted, fontSize: 10, fontWeight: '700' },
  angle: {
    marginLeft: 'auto',
    padding: 0,
    color: theme.palette.slate.text,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'right',
  },
})
