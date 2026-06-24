import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { theme } from '@/constants/theme'

/** Neutral tilt (0..255), matching native `REMOTE_TILT_CENTER`. */
const TILT_CENTER = 128
const TILT_MAX = 255
/** Longest ease-to-center the top of the (non-lock) pad maps to. */
const MAX_DECAY_MS = 60_000
const PAD_HEIGHT = 240
const THUMB_RADIUS = 14
/** Top band: releasing here locks the tilt forever (no ease). */
const LOCK_BAND = 32
/**
 * Decay time grows with the square of the vertical position, so the lower
 * (short-time) part of the pad gets most of the travel — fine control for quick
 * eases, while long durations are still reachable near the top.
 */
const DECAY_EXP = 2
/** Seconds drawn as horizontal grid lines (0 = bottom, 60 = top edge). */
const TIME_MARKS = [1, 3, 8, 20, 40] as const
/** Tilt percentages drawn as vertical grid lines (0 = center, edges omitted). */
const TILT_MARKS = [-50, 50] as const
/** Tilt percentages that get a text label. */
const TILT_LABELS = [-50, 0, 50] as const

function clampUnit(t: number) {
  return Math.min(1, Math.max(0, t))
}

/** Vertical travel (0 bottom .. 1 top of decay zone) → decay ms. */
function decayFromTravel(travel: number) {
  return Math.round(MAX_DECAY_MS * clampUnit(travel) ** DECAY_EXP)
}

/** Decay ms → vertical travel (inverse of {@link decayFromTravel}). */
function travelFromDecay(ms: number) {
  return clampUnit(ms / MAX_DECAY_MS) ** (1 / DECAY_EXP)
}

/** Y pixel for a given decay time inside a pad of `height`. */
function yForDecay(ms: number, height: number) {
  const span = Math.max(1, height - LOCK_BAND)
  return height - travelFromDecay(ms) * span
}

/** X fraction (0..1) for a tilt percentage (-100..100). */
function xFractionForTilt(percent: number) {
  return (TILT_CENTER + (percent / 100) * (TILT_MAX - TILT_CENTER)) / TILT_MAX
}

interface RemoteTiltPadProps {
  disabled?: boolean
  /** Live tilt while the finger is down (0..255, 128 neutral). */
  onChange: (value: number) => void
  /** On lift below the lock band: ease `value` back to neutral over `durationMs`. */
  onRelease: (value: number, durationMs: number) => void
  /** On lift in the lock band: hold `value` indefinitely until cancelled. */
  onLock: (value: number) => void
  /** Abort the active tilt: snap straight to neutral. */
  onCancel: () => void
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** Pad position (px) → tilt value (X), decay duration and lock flag (Y). */
function positionToIntent(x: number, y: number, width: number, height: number) {
  const value = Math.round(clamp(x / width, 0, 1) * TILT_MAX)
  const locked = y <= LOCK_BAND
  const span = Math.max(1, height - LOCK_BAND)
  const durationMs = decayFromTravel((height - y) / span)
  return { value, durationMs, locked }
}

/**
 * Two-dimensional remote-tilt pad. Horizontal sets the nose tilt; vertical sets
 * how long it eases back to center after release. One drag picks both: lift, and
 * the board glides tilt → center over the chosen time. Purely presentational —
 * it emits intents and never touches native.
 */
export function RemoteTiltPad({
  disabled,
  onChange,
  onRelease,
  onLock,
  onCancel,
}: RemoteTiltPadProps) {
  const layoutRef = useRef({ width: 0, height: PAD_HEIGHT })
  const intentRef = useRef({ value: TILT_CENTER, durationMs: 0, locked: false })
  const disabledRef = useRef(disabled)
  const onChangeRef = useRef(onChange)
  const onReleaseRef = useRef(onRelease)
  const onLockRef = useRef(onLock)
  const onCancelRef = useRef(onCancel)

  useEffect(() => {
    disabledRef.current = disabled
    onChangeRef.current = onChange
    onReleaseRef.current = onRelease
    onLockRef.current = onLock
    onCancelRef.current = onCancel
  })

  const [thumb, setThumb] = useState<{ x: number; y: number } | null>(null)
  const thumbRef = useRef<{ x: number; y: number } | null>(null)
  const [active, setActive] = useState(false)
  const [display, setDisplay] = useState({ value: TILT_CENTER, durationMs: 0, locked: false })
  const easeTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const moveThumb = (next: { x: number; y: number }) => {
    thumbRef.current = next
    setThumb(next)
  }

  /** Resting spot of the always-visible point: neutral tilt, zero ease time. */
  const restPosition = () => {
    const { width, height } = layoutRef.current
    return { x: width * (TILT_CENTER / TILT_MAX), y: height - THUMB_RADIUS }
  }

  const rest = () => {
    moveThumb(restPosition())
    setDisplay({ value: TILT_CENTER, durationMs: 0, locked: false })
    setActive(false)
  }

  const stopEase = () => {
    if (easeTimer.current) {
      clearInterval(easeTimer.current)
      easeTimer.current = null
    }
  }

  useEffect(() => stopEase, [])

  const track = useCallback((event: GestureResponderEvent) => {
    const { width, height } = layoutRef.current
    if (width === 0) return
    stopEase()
    setActive(true)
    const x = clamp(event.nativeEvent.locationX, 0, width)
    const y = clamp(event.nativeEvent.locationY, 0, height)
    moveThumb({ x, y })
    const next = positionToIntent(x, y, width, height)
    intentRef.current = next
    setDisplay(next)
    onChangeRef.current(next.value)
  }, [])

  // Glide the thumb to the center line while native eases tilt back to neutral.
  const end = useCallback(() => {
    const { value, durationMs, locked } = intentRef.current
    stopEase()

    // Lock band: hold the tilt forever. Native is already streaming the held
    // value, so just freeze the thumb and keep it active until cancelled.
    if (locked) {
      onLockRef.current(value)
      setActive(true)
      return
    }

    onReleaseRef.current(value, durationMs)
    intentRef.current = { value: TILT_CENTER, durationMs: 0, locked: false }

    const { width, height } = layoutRef.current
    const start = thumbRef.current
    if (durationMs <= 0 || start === null || width === 0) {
      rest()
      return
    }
    const target = restPosition()
    const startedAt = Date.now()
    easeTimer.current = setInterval(() => {
      const t = Math.min(1, (Date.now() - startedAt) / durationMs)
      const x = start.x + (target.x - start.x) * t
      const y = start.y + (target.y - start.y) * t // slide to bottom as time runs out
      moveThumb({ x, y })
      setDisplay(positionToIntent(x, y, width, height))
      if (t >= 1) {
        stopEase()
        rest()
      }
    }, 30)
  }, [])

  const cancel = useCallback(() => {
    stopEase()
    intentRef.current = { value: TILT_CENTER, durationMs: 0, locked: false }
    rest()
    onCancelRef.current()
  }, [])

  const panResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- refs only read inside PanResponder callbacks, not during render
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        onPanResponderGrant: track,
        onPanResponderMove: track,
        onPanResponderRelease: end,
        onPanResponderTerminate: end,
      }),
    [track, end],
  )

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    layoutRef.current = { width, height }
    if (thumbRef.current === null) moveThumb(restPosition())
  }

  const tiltPercent = Math.round(((display.value - TILT_CENTER) / (TILT_MAX - TILT_CENTER)) * 100)
  const decaySeconds = (display.durationMs / 1000).toFixed(1)

  return (
    <View>
      <View
        {...panResponder.panHandlers}
        onLayout={onLayout}
        style={[styles.pad, disabled && styles.padDisabled]}
      >
        {TILT_MARKS.map((percent) => (
          <View
            key={`v${percent}`}
            pointerEvents="none"
            style={[styles.gridLineV, { left: `${xFractionForTilt(percent) * 100}%` }]}
          />
        ))}
        <View pointerEvents="none" style={[styles.gridLineV, styles.centerLine]} />
        {TILT_LABELS.map((percent) => (
          <Text
            key={`vl${percent}`}
            pointerEvents="none"
            style={[styles.tiltLabel, { left: `${xFractionForTilt(percent) * 100}%` }]}
          >
            {percent > 0 ? `+${percent}` : percent}%
          </Text>
        ))}
        {TIME_MARKS.map((sec) => (
          <View
            key={`h${sec}`}
            pointerEvents="none"
            style={[styles.gridLineH, { top: yForDecay(sec * 1000, PAD_HEIGHT) }]}
          >
            <Text style={styles.gridLabel}>{sec}s</Text>
          </View>
        ))}
        <View pointerEvents="none" style={styles.lockBand}>
          <Text style={styles.lockBandText}>lock</Text>
        </View>
        <Text pointerEvents="none" style={[styles.axisLabel, styles.axisTop]}>
          {(MAX_DECAY_MS / 1000).toFixed(0)}s
        </Text>
        {thumb ? (
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              !active && styles.thumbRest,
              { left: thumb.x - THUMB_RADIUS, top: thumb.y - THUMB_RADIUS },
            ]}
          />
        ) : null}
      </View>
      <View style={styles.readout}>
        <Text style={styles.readoutValue}>
          {tiltPercent > 0 ? `+${tiltPercent}` : tiltPercent}%
        </Text>
        <Text style={styles.readoutTime}>
          {display.locked ? 'LOCKED ∞' : `ease ${decaySeconds}s`}
        </Text>
      </View>
      {active ? (
        <View style={styles.cancelRow}>
          <Pressable onPress={cancel} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  pad: {
    height: PAD_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    backgroundColor: theme.neutral.surfaceDeep,
    overflow: 'hidden',
  },
  padDisabled: {
    opacity: 0.4,
  },
  lockBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: LOCK_BAND,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: theme.neutral.borderMuted,
    borderStyle: 'dashed',
  },
  lockBandText: {
    color: theme.neutral.textMuted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  gridLineV: {
    position: 'absolute',
    top: LOCK_BAND + 16,
    bottom: 0,
    width: 1,
    marginLeft: -0.5,
    backgroundColor: theme.neutral.borderMuted,
  },
  centerLine: {
    left: '50%',
    backgroundColor: theme.neutral.border,
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: theme.neutral.borderMuted,
  },
  gridLabel: {
    position: 'absolute',
    right: 6,
    top: 2,
    color: theme.neutral.textDim,
    fontSize: 9,
    fontWeight: '600',
  },
  tiltLabel: {
    position: 'absolute',
    top: LOCK_BAND + 3,
    width: 40,
    marginLeft: -20,
    textAlign: 'center',
    color: theme.neutral.textDim,
    fontSize: 9,
    fontWeight: '600',
  },
  axisLabel: {
    position: 'absolute',
    color: theme.neutral.textDim,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  axisTop: {
    top: LOCK_BAND + 4,
    right: 6,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_RADIUS * 2,
    height: THUMB_RADIUS * 2,
    borderRadius: 999,
    backgroundColor: theme.wheel.color,
    borderWidth: 2,
    borderColor: theme.neutral.textPrimary,
  },
  thumbRest: {
    backgroundColor: theme.neutral.textMuted,
    borderColor: theme.neutral.border,
  },
  readout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  readoutValue: {
    color: theme.wheel.text,
    fontFamily: 'monospace',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  readoutTime: {
    color: theme.neutral.textSecondary,
    fontFamily: 'monospace',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  cancelRow: {
    alignItems: 'center',
    marginTop: 8,
  },
  cancel: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.warning.border,
    backgroundColor: theme.warning.bg,
  },
  cancelText: {
    color: theme.warning.text,
    fontSize: 13,
    fontWeight: '700',
  },
})
