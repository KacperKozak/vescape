import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { ArrowCounterClockwiseIcon, QuestionIcon } from 'phosphor-react-native'
import Svg, { Circle, G, Line, Path } from 'react-native-svg'
import Animated, {
  useAnimatedProps,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import type { TuneProfileFieldValue } from 'vesc-ble'

import { theme } from '@/constants/theme'
import { IconButton } from '@/components/ui/base/IconButton'
import {
  DEFAULT_TUNE_PREVIEW_ADVANCED_PHYSICS,
  TUNE_PREVIEW_RESET_SPEED_KMH,
  createTunePreviewModel,
  createTunePreviewState,
  groundTravelToVisualOffset,
  resetTunePreviewSpeed,
  stepTunePreview,
  terrainSlopeToSyntheticAcceleration,
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
  deckDisturbanceDegrees: SharedValue<number>
  deckDisturbanceActive: SharedValue<boolean>
  hillsEnabled?: boolean
  hillHeightMeters?: number
  hillSpacingMeters?: number
  advancedPhysics?: TunePreviewAdvancedPhysics
  active?: boolean
  onHelp: () => void
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
const READOUT_INTERVAL_MS = 100

export function TunePreview({
  fields,
  deckDisturbanceDegrees,
  deckDisturbanceActive,
  hillsEnabled = false,
  hillHeightMeters = 2.5,
  hillSpacingMeters = 30,
  advancedPhysics = DEFAULT_TUNE_PREVIEW_ADVANCED_PHYSICS,
  active = true,
  onHelp,
}: TunePreviewProps) {
  const model = useMemo(() => createTunePreviewModel(fields), [fields])
  const { width: canvasWidth } = useWindowDimensions()
  const stateRef = useRef(createTunePreviewState(TUNE_PREVIEW_RESET_SPEED_KMH))
  const lastTimestampRef = useRef<number | null>(null)
  const lastReadoutTimestampRef = useRef(0)
  const [readouts, setReadouts] = useState({
    angle: '0.0°',
    resistance: 'Resistance +0.00',
    speed: TUNE_PREVIEW_RESET_SPEED_KMH.toFixed(1),
    current: '0 A',
  })
  const angleDegrees = useSharedValue(0)
  const targetAngleDegrees = useSharedValue(0)
  const groundOffset = useSharedValue(0)
  const terrainPathValue = useSharedValue(
    terrainPath(canvasWidth, 0, hillHeightMeters, hillSpacingMeters),
  )
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

  const handleResetSpeed = useCallback(() => {
    stateRef.current = resetTunePreviewSpeed(
      stateRef.current,
      TUNE_PREVIEW_RESET_SPEED_KMH,
      advancedPhysics,
    )
    setReadouts((current) => ({
      ...current,
      speed: TUNE_PREVIEW_RESET_SPEED_KMH.toFixed(1),
    }))
  }, [advancedPhysics])

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
            deckDisturbanceDegrees: deckDisturbanceDegrees.value,
            deckDisturbanceActive: deckDisturbanceActive.value,
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
        if (timestamp - lastReadoutTimestampRef.current >= READOUT_INTERVAL_MS) {
          lastReadoutTimestampRef.current = timestamp
          const resistance = terrainSlopeToSyntheticAcceleration(next.terrainSlope)
          const current = next.syntheticCurrentAmps
          setReadouts({
            angle: `${next.angleDegrees.toFixed(1)}°`,
            resistance: hillsEnabled
              ? `Hill load ${next.terrainLoadCurrentAmps >= 0 ? '+' : ''}${next.terrainLoadCurrentAmps.toFixed(1)} A`
              : `Resistance ${resistance >= 0 ? '+' : ''}${resistance.toFixed(2)} m/s²`,
            speed: next.syntheticSpeedKmh.toFixed(1),
            current: `${current > 0 ? '+' : ''}${current.toFixed(0)} A`,
          })
        }
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
    canvasWidth,
    deckDisturbanceActive,
    deckDisturbanceDegrees,
    groundOffset,
    hillHeightMeters,
    hillSpacingMeters,
    hillsEnabled,
    model,
    targetAngleDegrees,
    terrainPathValue,
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
        <View style={styles.speedActions}>
          <View style={styles.speedReadout}>
            <Text style={styles.speedValue}>{readouts.speed}</Text>
            <Text style={styles.speedUnit}>km/h</Text>
          </View>
          <IconButton
            icon={ArrowCounterClockwiseIcon}
            onPress={handleResetSpeed}
            accessibilityLabel="Reset preview speed to 15 kilometers per hour"
            testID="tune-preview-reset-speed"
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
            <Text style={styles.angle}>{readouts.angle}</Text>
            <Text style={styles.current}>{readouts.current}</Text>
            {hillsEnabled ? <Text style={styles.resistance}>{readouts.resistance}</Text> : null}
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
  current: {
    width: 48,
    padding: 0,
    color: theme.telemetry.motorCurrent,
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
  speedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
