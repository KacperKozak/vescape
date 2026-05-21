export const DIAL_WIDTH_BASELINE = 700
export const TARGET_LABEL_PX = 70
export const MIN_STEP_PX = 2
export const ALL_STEP_LABEL_MIN_PX = 56

export const DRAG_RANGE_GAIN = 1
export const THROW_DISTANCE_GAIN = 0.9
export const MAX_THROW_VELOCITY = 900
export const THROW_SAMPLE_SMOOTHING = 0.16
export const THROW_RELEASE_BOOST_LIMIT = 1.35
export const THROW_STATIONARY_FADE_START_MS = 80
export const THROW_STATIONARY_FADE_END_MS = 120
export const MIN_THROW_DURATION_MS = 800
export const MAX_THROW_DURATION_MS = 2000
export const STRONG_THROW_INPUT_VELOCITY = 1800
export const THROW_EASE_POWER = 1.15
export const MOMENTUM_CARRY = 0.9
export const DETENT_DECAY_PER_FRAME = 0.9
export const DETENT_PULL = 140
export const DETENT_FULL_STRENGTH_STEPS = 20
export const MIN_DENSE_DETENT_STRENGTH = 0
export const DETENT_CAPTURE_VELOCITY = 950
export const LOCK_VELOCITY = 22

export interface TuneDialLayout {
  totalSteps: number
  totalWidth: number
  stepPx: number
  majorEvery: number
  minorEvery: number
  renderMinor: boolean
  labelEveryStep: boolean
  renderMidpointTicks: boolean
}

export interface TuneDialThrowState {
  offset: number
  velocity: number
  durationMs: number
  elapsedMs: number
}

export function niceMajorValue(range: number): number {
  if (range <= 1) return 0.1
  if (range <= 2) return 0.5
  if (range <= 5) return 1
  if (range <= 15) return 1
  if (range <= 30) return 5
  if (range <= 100) return 10
  return 50
}

export function computeTuneDialLayout(min: number, max: number, step: number): TuneDialLayout {
  const range = max - min
  const totalSteps = Math.round(range / step)

  const majorVal = niceMajorValue(range)
  const majorEvery = Math.max(1, Math.round(majorVal / step))
  const rawStepPx = TARGET_LABEL_PX / majorEvery
  const stepPx = Math.max(MIN_STEP_PX, rawStepPx)
  const totalWidth = totalSteps * stepPx

  const minorEvery = Math.max(1, Math.round(majorEvery / 5))
  const minMinorPx = 6
  const renderMinor = minorEvery * stepPx >= minMinorPx
  const labelEveryStep = stepPx >= ALL_STEP_LABEL_MIN_PX
  const renderMidpointTicks = labelEveryStep

  return {
    totalSteps,
    totalWidth,
    stepPx,
    majorEvery,
    minorEvery,
    renderMinor,
    labelEveryStep,
    renderMidpointTicks,
  }
}

export function computeRangeScale(totalWidth: number): number {
  'worklet'

  return totalWidth / DIAL_WIDTH_BASELINE
}

export function computeDetentStrength(totalSteps: number): number {
  'worklet'

  if (totalSteps > DETENT_FULL_STRENGTH_STEPS) return 0
  return 1
}

export function computeMomentumEmitEverySteps(totalSteps: number): number {
  'worklet'

  return Math.max(1, Math.ceil(totalSteps / DETENT_FULL_STRENGTH_STEPS))
}

export function computeHapticStepSpacing(
  layout: Pick<TuneDialLayout, 'labelEveryStep' | 'majorEvery'>,
): number {
  'worklet'

  return layout.labelEveryStep ? 1 : layout.majorEvery
}

export function shouldPlayTuneDialHaptic(
  previousStepIndex: number,
  nextStepIndex: number,
  hapticStepSpacing: number,
): boolean {
  'worklet'

  if (previousStepIndex === nextStepIndex) return false

  const spacing = Math.max(1, hapticStepSpacing)
  return Math.floor(previousStepIndex / spacing) !== Math.floor(nextStepIndex / spacing)
}

export function computeMomentumEmitStepIndex(stepIndex: number, totalSteps: number): number {
  'worklet'

  const emitEverySteps = computeMomentumEmitEverySteps(totalSteps)
  return Math.max(0, Math.min(totalSteps, Math.round(stepIndex / emitEverySteps) * emitEverySteps))
}

export function computeThrowStartVelocity(gestureVelocityX: number, totalWidth: number): number {
  'worklet'

  const rangeScale = computeRangeScale(totalWidth)
  const maxVelocity = MAX_THROW_VELOCITY * Math.max(0.2, rangeScale)
  const normalizedVelocity = gestureVelocityX * THROW_DISTANCE_GAIN * rangeScale
  return Math.max(-maxVelocity, Math.min(maxVelocity, normalizedVelocity))
}

export function smoothThrowGestureVelocity(
  previousVelocityX: number,
  sampleVelocityX: number,
): number {
  'worklet'

  if (previousVelocityX === 0) return sampleVelocityX
  return previousVelocityX * (1 - THROW_SAMPLE_SMOOTHING) + sampleVelocityX * THROW_SAMPLE_SMOOTHING
}

export function resolveThrowGestureVelocity(
  releaseVelocityX: number,
  smoothedVelocityX: number,
  translationX: number,
  stationaryMs = 0,
): number {
  'worklet'

  const direction = Math.sign(translationX || smoothedVelocityX || releaseVelocityX)
  if (direction === 0) return 0

  const release = Math.sign(releaseVelocityX) === direction ? Math.abs(releaseVelocityX) : 0
  const stationaryFade =
    stationaryMs <= THROW_STATIONARY_FADE_START_MS
      ? 1
      : Math.max(
          0,
          1 -
            (stationaryMs - THROW_STATIONARY_FADE_START_MS) /
              (THROW_STATIONARY_FADE_END_MS - THROW_STATIONARY_FADE_START_MS),
        )
  const smoothed =
    Math.sign(smoothedVelocityX) === direction ? Math.abs(smoothedVelocityX) * stationaryFade : 0
  const cappedRelease =
    smoothed > 0 ? Math.min(release, smoothed * THROW_RELEASE_BOOST_LIMIT) : release
  const velocity = Math.max(smoothed, cappedRelease)

  return velocity * direction
}

export function computeThrowDurationMs(
  gestureVelocityX: number,
  velocity: number,
  totalWidth: number,
): number {
  'worklet'

  const rangeScale = computeRangeScale(totalWidth)
  const maxVelocity = MAX_THROW_VELOCITY * Math.max(0.2, rangeScale)
  const throwPower = Math.min(
    1,
    Math.max(
      Math.abs(gestureVelocityX) / STRONG_THROW_INPUT_VELOCITY,
      Math.abs(velocity) / maxVelocity,
    ),
  )

  return MIN_THROW_DURATION_MS + (MAX_THROW_DURATION_MS - MIN_THROW_DURATION_MS) * throwPower
}

export function tickTuneDialThrowFrame(
  state: TuneDialThrowState,
  layout: Pick<TuneDialLayout, 'stepPx' | 'totalSteps' | 'totalWidth'>,
  frameMs: number,
): TuneDialThrowState {
  const rawDt = frameMs
  const dt = Math.min(rawDt, 34) / 1000
  const previousProgress =
    state.durationMs > 0 ? Math.min(1, state.elapsedMs / state.durationMs) : 1
  const elapsedMs = state.durationMs > 0 ? Math.min(state.durationMs, state.elapsedMs + rawDt) : 0
  const progress = state.durationMs > 0 ? Math.min(1, elapsedMs / state.durationMs) : 1
  const remainingRatio =
    previousProgress >= 1 ? 0 : (1 - progress) / Math.max(0.001, 1 - previousProgress)
  let velocity = state.velocity * Math.pow(Math.max(0, remainingRatio), THROW_EASE_POWER)

  if (Math.abs(velocity) <= LOCK_VELOCITY) {
    return {
      offset: Math.round(state.offset / layout.stepPx) * layout.stepPx,
      velocity: 0,
      durationMs: 0,
      elapsedMs: 0,
    }
  }

  let offset = state.offset + velocity * dt
  if (offset > 0 || offset < -layout.totalWidth) {
    offset = Math.max(-layout.totalWidth, Math.min(0, offset))
    return { offset, velocity: 0, durationMs: 0, elapsedMs: 0 }
  }

  const nearestStepIndex = Math.max(
    0,
    Math.min(layout.totalSteps, Math.round(-offset / layout.stepPx)),
  )
  const nearestStepOffset = -nearestStepIndex * layout.stepPx
  const detentStrength = computeDetentStrength(layout.totalSteps)
  const detentRadius = Math.max(1.5, Math.min(layout.stepPx * 0.34, 18))
  const detentPull = DETENT_PULL * detentStrength
  const detentDecayPerFrame = 1 - (1 - DETENT_DECAY_PER_FRAME) * detentStrength
  const detentCaptureVelocity = DETENT_CAPTURE_VELOCITY * detentStrength
  const detentDistance = offset - nearestStepOffset

  if (Math.abs(detentDistance) <= detentRadius && Math.abs(velocity) <= detentCaptureVelocity) {
    velocity =
      (velocity - detentDistance * detentPull * dt) * Math.pow(detentDecayPerFrame, dt * 60)
  }

  return { offset, velocity, durationMs: state.durationMs, elapsedMs }
}

export function simulateTuneDialThrow(
  layout: Pick<TuneDialLayout, 'stepPx' | 'totalSteps' | 'totalWidth'>,
  gestureVelocityX: number,
  startOffset = 0,
  frameMs = 16,
): TuneDialThrowState {
  const velocity = computeThrowStartVelocity(gestureVelocityX, layout.totalWidth)
  let state: TuneDialThrowState = {
    offset: startOffset,
    velocity,
    durationMs: computeThrowDurationMs(gestureVelocityX, velocity, layout.totalWidth),
    elapsedMs: 0,
  }

  for (let i = 0; i < 240 && state.velocity !== 0; i++) {
    state = tickTuneDialThrowFrame(state, layout, frameMs)
  }

  return state
}
