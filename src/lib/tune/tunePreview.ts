import type { TuneProfileFieldValue } from 'vesc-ble'

export const TUNE_PREVIEW_MODEL_VERSION = 'refloat-bundled-legacy-v1' as const

const REQUIRED_FIELDS = ['kp', 'kp2', 'ki', 'mahony_kp'] as const
const MAX_ELAPSED_SECONDS = 0.25
const STEP_SECONDS = 1 / 120
const MAX_ANGLE_DEGREES = 35
const MAX_RATE_DEGREES_PER_SECOND = 120

export interface TunePreviewParameters {
  modelVersion: typeof TUNE_PREVIEW_MODEL_VERSION
  kp: number
  kp2: number
  ki: number
  mahonyKp: number
}

export type TunePreviewModel =
  | { status: 'ready'; parameters: TunePreviewParameters }
  | {
      status: 'unsupported'
      modelVersion: typeof TUNE_PREVIEW_MODEL_VERSION
      missingFields: string[]
    }

export interface TunePreviewState {
  angleDegrees: number
  angularRateDegreesPerSecond: number
  integralError: number
  targetAngleDegrees: number
}

export interface TunePreviewInput {
  riderLean: number
  paused?: boolean
}

export function createTunePreviewModel(
  fields: Record<string, TuneProfileFieldValue>,
): TunePreviewModel {
  const missingFields = REQUIRED_FIELDS.filter((id) => {
    const value = fields[id]
    return typeof value !== 'number' || !Number.isFinite(value)
  })

  if (missingFields.length > 0) {
    return { status: 'unsupported', modelVersion: TUNE_PREVIEW_MODEL_VERSION, missingFields }
  }

  return {
    status: 'ready',
    parameters: {
      modelVersion: TUNE_PREVIEW_MODEL_VERSION,
      kp: fields.kp as number,
      kp2: fields.kp2 as number,
      ki: fields.ki as number,
      mahonyKp: fields.mahony_kp as number,
    },
  }
}

export function createTunePreviewState(): TunePreviewState {
  return {
    angleDegrees: 0,
    angularRateDegreesPerSecond: 0,
    integralError: 0,
    targetAngleDegrees: 0,
  }
}

export function stepTunePreview(
  state: TunePreviewState,
  parameters: TunePreviewParameters,
  input: TunePreviewInput,
  elapsedSeconds: number,
): TunePreviewState {
  if (input.paused || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return state

  let next = state
  let remaining = Math.min(elapsedSeconds, MAX_ELAPSED_SECONDS)
  while (remaining > 0) {
    const dt = Math.min(STEP_SECONDS, remaining)
    next = stepFixed(next, parameters, clamp(input.riderLean, -1, 1), dt)
    remaining -= dt
  }
  return next
}

function stepFixed(
  state: TunePreviewState,
  parameters: TunePreviewParameters,
  riderLean: number,
  dt: number,
): TunePreviewState {
  const error = state.angleDegrees - state.targetAngleDegrees
  const integralError = clamp(state.integralError + error * dt, -20, 20)

  // Comparative ideal-drive response. Synthetic Rider Lean is an external pitch moment,
  // never an angle command. Coefficients normalize the bundled Refloat PID/filter ranges.
  const stiffness = clamp(parameters.kp, 0, 40) * 0.32
  const rateDamping = 1.6 + clamp(parameters.kp2, 0, 3) * 4.2
  const filterSoftness = 0.7 + clamp(parameters.mahonyKp, 0.2, 3) * 0.35
  const integralCorrection = clamp(parameters.ki, 0, 0.5) * integralError * 16
  const riderMoment = riderLean * 34
  const angularAcceleration =
    (riderMoment -
      stiffness * error -
      rateDamping * state.angularRateDegreesPerSecond -
      integralCorrection) /
    filterSoftness
  const angularRateDegreesPerSecond = clamp(
    state.angularRateDegreesPerSecond + angularAcceleration * dt,
    -MAX_RATE_DEGREES_PER_SECOND,
    MAX_RATE_DEGREES_PER_SECOND,
  )
  const angleDegrees = clamp(
    state.angleDegrees + angularRateDegreesPerSecond * dt,
    -MAX_ANGLE_DEGREES,
    MAX_ANGLE_DEGREES,
  )

  return {
    angleDegrees: finiteOrZero(angleDegrees),
    angularRateDegreesPerSecond: finiteOrZero(angularRateDegreesPerSecond),
    integralError: finiteOrZero(integralError),
    targetAngleDegrees: 0,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}
