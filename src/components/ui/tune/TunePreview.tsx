/* eslint-disable react-hooks/immutability */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { ArrowCounterClockwiseIcon, QuestionIcon } from 'phosphor-react-native'
import Svg, { Circle, G, Line, Path } from 'react-native-svg'
import Animated, {
  useAnimatedProps,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import type { TuneProfileFieldValue } from 'vesc-ble'

import { interaction, theme } from '@/constants/theme'
import {
  DEFAULT_TUNE_PREVIEW_ADVANCED_PHYSICS,
  TUNE_PREVIEW_RESET_SPEED_KMH,
  TUNE_PREVIEW_MODEL_VERSION,
  calculateGroundToBoardAngleDegrees,
  createTunePreviewModel,
  createTunePreviewState,
  groundTravelToVisualOffset,
  resetTunePreviewSpeed,
  stepTunePreview,
  type TunePreviewAdvancedPhysics,
} from '@/lib/tune/tunePreview'
import {
  GROUND_TICK_SPACING_METERS,
  TUNE_PREVIEW_PIXELS_PER_METER,
  TUNE_PREVIEW_WHEEL_RADIUS_PIXELS,
  terrainHeightRelativeToWheel,
  tunePreviewDeckLine,
} from '@/lib/tune/tunePreviewGeometry'

interface TunePreviewProps {
  fields: Record<string, TuneProfileFieldValue>
  pitchInputDegrees: SharedValue<number>
  pitchInputActive: SharedValue<boolean>
  hillsEnabled?: boolean
  hillHeightMeters?: number
  hillSpacingMeters?: number
  advancedPhysics?: TunePreviewAdvancedPhysics
  active?: boolean
  onHelp: () => void
  hillLoadAmps?: SharedValue<number>
  speedKmh?: SharedValue<number>
  groundToBoardAngleDegrees?: SharedValue<number>
}

const GROUND_Y = 78
const WHEEL_RADIUS = TUNE_PREVIEW_WHEEL_RADIUS_PIXELS
const DECK_HALF_LENGTH = 72
const DECK_CENTER_Y = GROUND_Y - WHEEL_RADIUS
const ZERO_MARKER_GAP = 6
const ZERO_MARKER_LENGTH = 12
const GROUND_TICK_SPACING = GROUND_TICK_SPACING_METERS * TUNE_PREVIEW_PIXELS_PER_METER
const AnimatedLine = Animated.createAnimatedComponent(Line)
const AnimatedGroup = Animated.createAnimatedComponent(G)
const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)
const READOUT_INTERVAL_MS = 100

export function TunePreview({
  fields,
  pitchInputDegrees,
  pitchInputActive,
  hillsEnabled = false,
  hillHeightMeters = 2.5,
  hillSpacingMeters = 30,
  advancedPhysics = DEFAULT_TUNE_PREVIEW_ADVANCED_PHYSICS,
  active = true,
  onHelp,
  hillLoadAmps,
  speedKmh,
  groundToBoardAngleDegrees,
}: TunePreviewProps) {
  const model = useMemo(
    () => createTunePreviewModel(fields),
    // Restart the animation loop after a model hot reload instead of retaining its old closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields, TUNE_PREVIEW_MODEL_VERSION],
  )
  const { width: canvasWidth } = useWindowDimensions()
  const stateRef = useRef(createTunePreviewState(TUNE_PREVIEW_RESET_SPEED_KMH))
  const lastTimestampRef = useRef<number | null>(null)
  const lastReadoutTimestampRef = useRef(0)
  const angleDegrees = useSharedValue(0)
  const targetAngleDegrees = useSharedValue(0)
  const groundOffset = useSharedValue(0)
  const terrainPathValue = useSharedValue(
    terrainPath(canvasWidth, 0, hillHeightMeters, hillSpacingMeters),
  )
  const boardAngleStr = useSharedValue('0.0°')
  const targetAngleStr = useSharedValue('0.0°')
  const groundToBoardAngleStr = useSharedValue('0.0°')
  const speedStr = useSharedValue(TUNE_PREVIEW_RESET_SPEED_KMH.toFixed(1))
  const currentStr = useSharedValue('Motor 0 A')
  const centerX = canvasWidth / 2

  const deckAnimatedProps = useAnimatedProps(() =>
    tunePreviewDeckLine(angleDegrees.value, centerX, DECK_CENTER_Y, DECK_HALF_LENGTH),
  )
  const targetAnimatedProps = useAnimatedProps(() =>
    tunePreviewDeckLine(targetAngleDegrees.value, centerX, DECK_CENTER_Y, DECK_HALF_LENGTH),
  )
  const groundAnimatedProps = useAnimatedProps(() => ({
    transform: [{ translateX: groundOffset.value }],
  }))
  const terrainAnimatedProps = useAnimatedProps(() => ({
    d: terrainPathValue.value,
  }))
  const boardAngleProps = useAnimatedProps(() => {
    'worklet'
    return { text: boardAngleStr.value, defaultValue: boardAngleStr.value }
  })
  const targetAngleProps = useAnimatedProps(() => {
    'worklet'
    return { text: targetAngleStr.value, defaultValue: targetAngleStr.value }
  })
  const groundToBoardAngleProps = useAnimatedProps(() => {
    'worklet'
    return { text: groundToBoardAngleStr.value, defaultValue: groundToBoardAngleStr.value }
  })
  const speedProps = useAnimatedProps(() => {
    'worklet'
    return { text: speedStr.value, defaultValue: speedStr.value }
  })
  const currentProps = useAnimatedProps(() => {
    'worklet'
    return { text: currentStr.value, defaultValue: currentStr.value }
  })

  const handleResetSpeed = useCallback(() => {
    stateRef.current = resetTunePreviewSpeed(
      stateRef.current,
      TUNE_PREVIEW_RESET_SPEED_KMH,
      advancedPhysics,
    )
    speedStr.value = TUNE_PREVIEW_RESET_SPEED_KMH.toFixed(1)
    if (hillLoadAmps) hillLoadAmps.value = 0
    if (speedKmh) speedKmh.value = TUNE_PREVIEW_RESET_SPEED_KMH
  }, [advancedPhysics, hillLoadAmps, speedKmh, speedStr])

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
            pitchInputDegrees: pitchInputDegrees.value,
            pitchInputActive: pitchInputActive.value,
            speedKmh: stateRef.current.syntheticSpeedKmh,
            hillsEnabled,
            hillHeightMeters,
            hillSpacingMeters,
            advancedPhysics,
          },
          (timestamp - previous) / 1000,
        )
        stateRef.current = next
        angleDegrees.value = next.angleDegrees
        targetAngleDegrees.value = next.targetAngleDegrees
        groundOffset.value = groundTravelToVisualOffset(next.groundTravelMeters)
        terrainPathValue.value = terrainPath(
          canvasWidth,
          next.groundTravelMeters,
          hillHeightMeters,
          hillSpacingMeters,
        )
        const groundToBoardAngle = calculateGroundToBoardAngleDegrees(
          next.angleDegrees,
          next.terrainSlope,
        )
        if (groundToBoardAngleDegrees) groundToBoardAngleDegrees.value = groundToBoardAngle
        if (timestamp - lastReadoutTimestampRef.current >= READOUT_INTERVAL_MS) {
          lastReadoutTimestampRef.current = timestamp
          const current = next.syntheticCurrentAmps
          boardAngleStr.value = formatSignedDegrees(next.angleDegrees)
          targetAngleStr.value = formatSignedDegrees(next.targetAngleDegrees)
          groundToBoardAngleStr.value = formatSignedDegrees(groundToBoardAngle)
          speedStr.value = next.syntheticSpeedKmh.toFixed(1)
          currentStr.value = `Motor ${current > 0 ? '+' : ''}${current.toFixed(0)} A`
          if (hillLoadAmps) hillLoadAmps.value = next.terrainLoadCurrentAmps
        }
        if (speedKmh) speedKmh.value = next.syntheticSpeedKmh
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
    advancedPhysics,
    angleDegrees,
    boardAngleStr,
    canvasWidth,
    currentStr,
    groundToBoardAngleDegrees,
    groundOffset,
    groundToBoardAngleStr,
    hillHeightMeters,
    hillSpacingMeters,
    hillsEnabled,
    hillLoadAmps,
    model,
    pitchInputActive,
    pitchInputDegrees,
    speedKmh,
    speedStr,
    targetAngleDegrees,
    targetAngleStr,
    terrainPathValue,
  ])

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Tune Preview</Text>
            <Pressable hitSlop={8} onPress={onHelp}>
              <QuestionIcon size={14} color={theme.palette.slate.textMuted} weight="bold" />
            </Pressable>
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={styles.boardSwatch} />
              <Text style={styles.boardLegendText}>Board </Text>
              <AnimatedTextInput
                editable={false}
                caretHidden
                pointerEvents="none"
                underlineColorAndroid="transparent"
                animatedProps={boardAngleProps}
                style={[styles.boardLegendValue]}
              />
            </View>
            <View style={styles.legendItem}>
              <View style={styles.targetSwatch} />
              <Text style={styles.targetLegendText}>Target </Text>
              <AnimatedTextInput
                editable={false}
                caretHidden
                pointerEvents="none"
                underlineColorAndroid="transparent"
                animatedProps={targetAngleProps}
                style={[styles.targetLegendValue]}
              />
            </View>
          </View>
        </View>
        <View style={styles.headerMetrics}>
          <Pressable
            onPress={handleResetSpeed}
            accessibilityLabel="Reset preview speed to 15 kilometers per hour"
            accessibilityRole="button"
            testID="tune-preview-reset-speed"
            style={({ pressed }) => [
              styles.speedReadout,
              pressed && { opacity: interaction.pressedOpacity },
            ]}
          >
            <ArrowCounterClockwiseIcon
              size={13}
              color={theme.palette.slate.textMuted}
              weight="bold"
            />
            <View style={styles.speedValueGroup}>
              <AnimatedTextInput
                editable={false}
                caretHidden
                pointerEvents="none"
                underlineColorAndroid="transparent"
                animatedProps={speedProps}
                style={[styles.speedValue]}
              />
              <Text style={styles.speedUnit}>km/h</Text>
            </View>
          </Pressable>
          <AnimatedTextInput
            editable={false}
            caretHidden
            pointerEvents="none"
            underlineColorAndroid="transparent"
            animatedProps={currentProps}
            style={[styles.current]}
          />
        </View>
      </View>

      {model.status === 'unsupported' ? (
        <View style={styles.unsupported}>
          <Text style={styles.unsupportedTitle}>Preview unavailable</Text>
          <Text style={styles.unsupportedText}>Missing: {model.missingFields.join(', ')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.canvasWrap}>
            <Svg
              width="100%"
              height={122}
              viewBox={`0 0 ${canvasWidth} 122`}
              accessibilityLabel="Board angle preview"
            >
              <Line
                x1={centerX - DECK_HALF_LENGTH - ZERO_MARKER_GAP - ZERO_MARKER_LENGTH}
                y1={DECK_CENTER_Y}
                x2={centerX - DECK_HALF_LENGTH - ZERO_MARKER_GAP}
                y2={DECK_CENTER_Y}
                stroke={theme.palette.slate.textMuted}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
              <Line
                x1={centerX + DECK_HALF_LENGTH + ZERO_MARKER_GAP}
                y1={DECK_CENTER_Y}
                x2={centerX + DECK_HALF_LENGTH + ZERO_MARKER_GAP + ZERO_MARKER_LENGTH}
                y2={DECK_CENTER_Y}
                stroke={theme.palette.slate.textMuted}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
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
                fill={theme.palette.slate.bg}
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
                fill="none"
                stroke={theme.palette.slate.border}
                strokeWidth={1}
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
            <AnimatedTextInput
              editable={false}
              caretHidden
              pointerEvents="none"
              underlineColorAndroid="transparent"
              animatedProps={groundToBoardAngleProps}
              style={[styles.groundToBoardAngle]}
            />
          </View>
        </>
      )}
    </View>
  )
}

function groundTicks(canvasWidth: number): number[] {
  return Array.from(
    { length: Math.ceil(canvasWidth / GROUND_TICK_SPACING) + 1 },
    (_, index) => index * GROUND_TICK_SPACING,
  )
}

function formatSignedDegrees(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}°`
}

function terrainPath(width: number, travel: number, height: number, spacing: number): string {
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
  titleBlock: { gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerMetrics: { alignItems: 'flex-end', gap: 1 },

  unsupported: { height: 122, alignItems: 'center', justifyContent: 'center', gap: 5 },
  unsupportedTitle: { color: theme.palette.slate.textPrimary, fontSize: 13, fontWeight: '800' },
  unsupportedText: { color: theme.palette.slate.textMuted, fontSize: 11 },
  legend: { alignItems: 'flex-start', gap: 2, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  boardSwatch: { width: 18, height: 1, backgroundColor: theme.palette.sky.color },
  targetSwatch: {
    width: 18,
    height: 1,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.palette.purple.light,
  },
  boardLegendText: {
    color: theme.palette.sky.color,
    fontSize: 9,
  },
  targetLegendText: {
    color: theme.palette.purple.light,
    fontSize: 9,
  },
  current: {
    width: 80,
    padding: 0,
    color: theme.palette.slate.textMuted,
    fontSize: 9,
    fontFamily: 'monospace',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  speedReadout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  speedValueGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  speedValue: {
    padding: 0,
    color: theme.telemetry.speed,
    fontFamily: 'monospace',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '700',
  },
  speedUnit: {
    color: theme.palette.slate.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  boardLegendValue: {
    color: theme.palette.sky.color,
    fontSize: 9,
    fontFamily: 'monospace',
    padding: 0,
    fontVariant: ['tabular-nums'],
  },
  targetLegendValue: {
    color: theme.palette.purple.light,
    fontSize: 9,
    fontFamily: 'monospace',
    padding: 0,
    fontVariant: ['tabular-nums'],
  },
  canvasWrap: { position: 'relative', height: 122 },
  groundToBoardAngle: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    color: theme.palette.slate.textPrimary,
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '700',
    textAlign: 'center',
    padding: 0,
    fontVariant: ['tabular-nums'],
  },
})
