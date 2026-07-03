import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { QuestionIcon } from 'phosphor-react-native'
import Svg, { Circle, Line } from 'react-native-svg'
import type { TuneProfileFieldValue } from 'vesc-ble'

import { IconButton } from '@/components/ui/base/IconButton'
import { theme } from '@/constants/theme'
import {
  createTunePreviewModel,
  createTunePreviewState,
  stepTunePreview,
} from '@/lib/tune/tunePreview'

interface TunePreviewProps {
  fields: Record<string, TuneProfileFieldValue>
  riderLean: number
  active?: boolean
  onHelp: () => void
}

const CENTER_X = 150
const GROUND_Y = 104
const WHEEL_RADIUS = 25
const DECK_HALF_LENGTH = 72
const DECK_CENTER_Y = GROUND_Y - WHEEL_RADIUS

export function TunePreview({ fields, riderLean, active = true, onHelp }: TunePreviewProps) {
  const model = useMemo(() => createTunePreviewModel(fields), [fields])
  const [state, setState] = useState(createTunePreviewState)
  const stateRef = useRef(state)
  const lastTimestampRef = useRef<number | null>(null)

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
          { riderLean },
          (timestamp - previous) / 1000,
        )
        stateRef.current = next
        setState(next)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      lastTimestampRef.current = null
    }
  }, [active, model, riderLean])

  const deck = lineForAngle(state.angleDegrees)
  const target = lineForAngle(state.targetAngleDegrees)

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Tune Preview</Text>
          <Text style={styles.subtitle}>Comparative ideal response · 15 km/h</Text>
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
            viewBox="0 0 300 122"
            accessibilityLabel="Board angle preview"
          >
            <Line
              x1={target.x1}
              y1={target.y1}
              x2={target.x2}
              y2={target.y2}
              stroke={theme.palette.purple.light}
              strokeWidth={1}
              strokeDasharray="6 5"
            />
            <Line
              x1={deck.x1}
              y1={deck.y1}
              x2={deck.x2}
              y2={deck.y2}
              stroke={theme.palette.sky.color}
              strokeWidth={1}
              strokeLinecap="round"
            />
            <Circle
              cx={CENTER_X}
              cy={GROUND_Y - WHEEL_RADIUS}
              r={WHEEL_RADIUS}
              fill={theme.palette.slate.surfaceDeep}
              stroke={theme.palette.slate.textSecondary}
              strokeWidth={1}
            />
            <Circle
              cx={CENTER_X}
              cy={GROUND_Y - WHEEL_RADIUS}
              r={4}
              fill={theme.palette.slate.textSecondary}
            />
            <Line
              x1={0}
              y1={GROUND_Y}
              x2={300}
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
            <Text style={styles.angle}>{state.angleDegrees.toFixed(1)}°</Text>
          </View>
        </>
      )}
    </View>
  )
}

function lineForAngle(angleDegrees: number) {
  const radians = (-angleDegrees * Math.PI) / 180
  const dx = Math.cos(radians) * DECK_HALF_LENGTH
  const dy = Math.sin(radians) * DECK_HALF_LENGTH
  return { x1: CENTER_X - dx, y1: DECK_CENTER_Y - dy, x2: CENTER_X + dx, y2: DECK_CENTER_Y + dy }
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
  angle: { marginLeft: 'auto', color: theme.palette.slate.text, fontSize: 11, fontWeight: '800' },
})
