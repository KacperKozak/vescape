import { useEffect, useMemo, useRef } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { QuestionIcon } from 'phosphor-react-native'
import Svg, { Circle, G, Line, Path } from 'react-native-svg'
import Animated, {
  useAnimatedProps,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import type { TuneProfileFieldValue } from 'vesc-ble'

import { theme } from '@/constants/theme'
import {
  createTunePreviewModel,
  createTunePreviewState,
  groundTravelToVisualOffset,
  resetTunePreviewSpeed,
  stepTunePreview,
  terrainHeightRelativeToWheel,
  terrainSlopeToSyntheticAcceleration,
  type TunePreviewReferencePhysics,
} from '@/lib/tune/tunePreview'

interface TunePreviewProps {
  fields: Record<string, TuneProfileFieldValue>
  syntheticLoad: SharedValue<number>
  speedKmh: number
  holdSpeed?: boolean
  referencePhysics?: TunePreviewReferencePhysics
  hillsEnabled?: boolean
  hillHeightMeters?: number
  hillSpacingMeters?: number
  active?: boolean
  onHelp: () => void
}

const GROUND_Y = 78
const WHEEL_RADIUS = 25
const DECK_HALF_LENGTH = 72
const DECK_CENTER_Y = GROUND_Y - WHEEL_RADIUS
const GROUND_TICK_SPACING = 30
const AnimatedLine = Animated.createAnimatedComponent(Line)
const AnimatedGroup = Animated.createAnimatedComponent(G)
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)
const AnimatedPath = Animated.createAnimatedComponent(Path)

export function TunePreview({
  fields,
  syntheticLoad,
  speedKmh,
  holdSpeed = true,
  referencePhysics,
  hillsEnabled = false,
  hillHeightMeters = 5,
  hillSpacingMeters = 8,
  active = true,
  onHelp,
}: TunePreviewProps) {
  const model = useMemo(() => createTunePreviewModel(fields), [fields])
  const { width: canvasWidth } = useWindowDimensions()
  const stateRef = useRef(createTunePreviewState(speedKmh))
  const configuredSpeedRef = useRef(speedKmh)
  const lastTimestampRef = useRef<number | null>(null)
  const angleDegrees = useSharedValue(0)
  const targetAngleDegrees = useSharedValue(0)
  const groundOffset = useSharedValue(0)
  const groundTravel = useSharedValue(0)
  const terrainResistance = useSharedValue(0)
  const syntheticSpeed = useSharedValue(speedKmh)
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
  const resistanceTextAnimatedProps = useAnimatedProps(() => {
    const resistance = terrainResistance.value
    const value = `Resistance ${resistance >= 0 ? '+' : ''}${resistance.toFixed(2)}`
    return { text: value, value }
  })
  const speedTextAnimatedProps = useAnimatedProps(() => {
    const value = syntheticSpeed.value.toFixed(1)
    return { text: value, value }
  })
  const terrainAnimatedProps = useAnimatedProps(() => ({
    d: terrainPath(canvasWidth, groundTravel.value, hillHeightMeters, hillSpacingMeters),
  }))

  useEffect(() => {
    configuredSpeedRef.current = speedKmh
  }, [speedKmh])

  useEffect(() => {
    const configuredSpeed = configuredSpeedRef.current
    stateRef.current = resetTunePreviewSpeed(stateRef.current, configuredSpeed)
  }, [holdSpeed])

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
          {
            syntheticLoad: syntheticLoad.value,
            speedKmh,
            holdSpeed,
            referencePhysics,
            hillsEnabled,
            hillHeightMeters,
            hillSpacingMeters,
          },
          (timestamp - previous) / 1000,
        )
        stateRef.current = next
        angleDegrees.value = next.angleDegrees
        targetAngleDegrees.value = next.targetAngleDegrees
        groundOffset.value = groundTravelToVisualOffset(next.groundTravelMeters)
        groundTravel.value = next.groundTravelMeters
        terrainResistance.value = terrainSlopeToSyntheticAcceleration(next.terrainSlope)
        syntheticSpeed.value = next.syntheticSpeedKmh
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      lastTimestampRef.current = null
    }
  }, [
    active,
    angleDegrees,
    groundOffset,
    groundTravel,
    hillHeightMeters,
    hillSpacingMeters,
    hillsEnabled,
    holdSpeed,
    model,
    referencePhysics,
    syntheticLoad,
    speedKmh,
    syntheticSpeed,
    targetAngleDegrees,
    terrainResistance,
  ])

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Tune Preview</Text>
          <Pressable hitSlop={8} onPress={onHelp}>
            <QuestionIcon size={14} color={theme.palette.slate.textMuted} weight="bold" />
          </Pressable>
        </View>
        <View style={styles.speedReadout}>
          <AnimatedTextInput
            editable={false}
            defaultValue={speedKmh.toFixed(1)}
            animatedProps={speedTextAnimatedProps}
            style={styles.speedValue}
          />
          <Text style={styles.speedUnit}>km/h</Text>
        </View>
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
            {!hillsEnabled ? (
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
            ) : null}
            <Circle
              cx={centerX}
              cy={GROUND_Y - WHEEL_RADIUS}
              r={4}
              fill={theme.palette.slate.textSecondary}
            />
            {hillsEnabled ? (
              <AnimatedPath
                animatedProps={terrainAnimatedProps}
                fill="none"
                stroke={theme.palette.slate.textMuted}
                strokeWidth={1}
              />
            ) : (
              <Line
                x1={0}
                y1={GROUND_Y}
                x2={canvasWidth}
                y2={GROUND_Y}
                stroke={theme.palette.slate.textMuted}
                strokeWidth={1}
              />
            )}
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
            {hillsEnabled ? (
              <AnimatedTextInput
                editable={false}
                defaultValue="Resistance +0.00"
                animatedProps={resistanceTextAnimatedProps}
                style={styles.resistance}
              />
            ) : null}
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

function terrainPath(width: number, travel: number, height: number, spacing: number): string {
  'worklet'
  let path = ''
  for (let x = 0; x <= width; x += 6) {
    const y = GROUND_Y - terrainHeightRelativeToWheel(x - width / 2, travel, height, spacing)
    path += `${x === 0 ? 'M' : 'L'}${x},${y} `
  }
  return path
}

const styles = StyleSheet.create({
  card: {},
  header: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: theme.palette.slate.textPrimary, fontSize: 14, fontWeight: '900' },

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
  resistance: {
    width: 112,
    padding: 0,
    color: theme.palette.amber.text,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  speedReadout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  speedValue: {
    width: 64,
    padding: 0,
    color: theme.telemetry.speed,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  speedUnit: {
    color: theme.palette.slate.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
})
