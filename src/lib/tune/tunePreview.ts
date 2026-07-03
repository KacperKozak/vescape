import type { TuneProfileFieldValue } from 'vesc-ble'

// Longitudinal target equations and transition signs derive from Refloat v1.2.1
// torque_tilt.c and brake_tilt.c (GPL-3.0-or-later), matching the bundled schema.

export const TUNE_PREVIEW_MODEL_VERSION = 'refloat-bundled-legacy-v1' as const
export const REFERENCE_ERPM_PER_KMH = 1000 / 3.5

const REQUIRED_FIELDS = [
  'kp',
  'kp2',
  'ki',
  'mahony_kp',
  'torquetilt_strength',
  'torquetilt_strength_regen',
  'torquetilt_start_current',
  'torquetilt_angle_limit',
  'torquetilt_on_speed',
  'torquetilt_off_speed',
  'braketilt_strength',
  'braketilt_lingering',
  'atr_on_speed',
  'atr_off_speed',
  'atr_strength_up',
  'atr_strength_down',
  'atr_threshold_up',
  'atr_threshold_down',
  'atr_speed_boost',
  'atr_angle_limit',
  'atr_response_boost',
  'atr_transition_boost',
  'atr_filter',
  'atr_amps_accel_ratio',
  'atr_amps_decel_ratio',
  'tiltback_constant',
  'tiltback_variable',
  'tiltback_variable_max',
] as const

const LEGACY_PROFILE_DEFAULTS = {
  tiltback_constant_erpm: 500,
  tiltback_variable_erpm: 0,
} as const

const MAX_ELAPSED_SECONDS = 0.25
const STEP_SECONDS = 1 / 120
const MAX_ANGLE_DEGREES = 35
const MAX_RATE_DEGREES_PER_SECOND = 120
const SYNTHETIC_CURRENT_AMPS = 60
const SYNTHETIC_BALANCE_OFFSET_DEGREES = 8

export interface TunePreviewParameters {
  modelVersion: typeof TUNE_PREVIEW_MODEL_VERSION
  kp: number
  kp2: number
  ki: number
  mahonyKp: number
  torqueTiltStrength: number
  torqueTiltStrengthRegen: number
  torqueTiltStartCurrent: number
  torqueTiltAngleLimit: number
  torqueTiltOnSpeed: number
  torqueTiltOffSpeed: number
  brakeTiltStrength: number
  brakeTiltLingering: number
  atrOnSpeed: number
  atrOffSpeed: number
  atrStrengthUp: number
  atrStrengthDown: number
  atrThresholdUp: number
  atrThresholdDown: number
  atrSpeedBoost: number
  atrAngleLimit: number
  atrResponseBoost: number
  atrTransitionBoost: number
  atrFilter: number
  atrAmpsAccelRatio: number
  atrAmpsDecelRatio: number
  tiltbackConstant: number
  tiltbackConstantErpm: number
  tiltbackVariable: number
  tiltbackVariableMax: number
  tiltbackVariableErpm: number
}

export type TunePreviewModel =
  | { status: 'ready'; parameters: TunePreviewParameters; assumedFields: string[] }
  | {
      status: 'unsupported'
      modelVersion: typeof TUNE_PREVIEW_MODEL_VERSION
      missingFields: string[]
    }

export interface TunePreviewTarget {
  torqueTiltDegrees: number
  brakeTiltDegrees: number
  atrDegrees: number
  constantTiltbackDegrees: number
  variableTiltbackDegrees: number
  totalDegrees: number
  syntheticCurrentAmps: number
  erpm: number
}

export interface TunePreviewState {
  angleDegrees: number
  angularRateDegreesPerSecond: number
  integralError: number
  targetAngleDegrees: number
  torqueTiltDegrees: number
  brakeTiltDegrees: number
  atrDegrees: number
  constantTiltbackDegrees: number
  variableTiltbackDegrees: number
  syntheticCurrentAmps: number
  erpm: number
  groundTravelMeters: number
  terrainSlope: number
  atrAccelDiff: number
  atrTargetDegrees: number
}

export interface TunePreviewInput {
  riderLean: number
  speedKmh: number
  hillsEnabled?: boolean
  hillHeightMeters?: number
  hillSpacingMeters?: number
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

  const assumedFields = Object.keys(LEGACY_PROFILE_DEFAULTS).filter((id) => {
    const value = fields[id]
    return typeof value !== 'number' || !Number.isFinite(value)
  })

  return {
    status: 'ready',
    assumedFields,
    parameters: {
      modelVersion: TUNE_PREVIEW_MODEL_VERSION,
      kp: numberField(fields, 'kp'),
      kp2: numberField(fields, 'kp2'),
      ki: numberField(fields, 'ki'),
      mahonyKp: numberField(fields, 'mahony_kp'),
      torqueTiltStrength: numberField(fields, 'torquetilt_strength'),
      torqueTiltStrengthRegen: numberField(fields, 'torquetilt_strength_regen'),
      torqueTiltStartCurrent: numberField(fields, 'torquetilt_start_current'),
      torqueTiltAngleLimit: numberField(fields, 'torquetilt_angle_limit'),
      torqueTiltOnSpeed: numberField(fields, 'torquetilt_on_speed'),
      torqueTiltOffSpeed: numberField(fields, 'torquetilt_off_speed'),
      brakeTiltStrength: numberField(fields, 'braketilt_strength'),
      brakeTiltLingering: numberField(fields, 'braketilt_lingering'),
      atrOnSpeed: numberField(fields, 'atr_on_speed'),
      atrOffSpeed: numberField(fields, 'atr_off_speed'),
      atrStrengthUp: numberField(fields, 'atr_strength_up'),
      atrStrengthDown: numberField(fields, 'atr_strength_down'),
      atrThresholdUp: numberField(fields, 'atr_threshold_up'),
      atrThresholdDown: numberField(fields, 'atr_threshold_down'),
      atrSpeedBoost: numberField(fields, 'atr_speed_boost'),
      atrAngleLimit: numberField(fields, 'atr_angle_limit'),
      atrResponseBoost: numberField(fields, 'atr_response_boost'),
      atrTransitionBoost: numberField(fields, 'atr_transition_boost'),
      atrFilter: numberField(fields, 'atr_filter'),
      atrAmpsAccelRatio: numberField(fields, 'atr_amps_accel_ratio'),
      atrAmpsDecelRatio: numberField(fields, 'atr_amps_decel_ratio'),
      tiltbackConstant: numberField(fields, 'tiltback_constant'),
      tiltbackConstantErpm: numberFieldOrDefault(
        fields,
        'tiltback_constant_erpm',
        LEGACY_PROFILE_DEFAULTS.tiltback_constant_erpm,
      ),
      tiltbackVariable: numberField(fields, 'tiltback_variable'),
      tiltbackVariableMax: numberField(fields, 'tiltback_variable_max'),
      tiltbackVariableErpm: numberFieldOrDefault(
        fields,
        'tiltback_variable_erpm',
        LEGACY_PROFILE_DEFAULTS.tiltback_variable_erpm,
      ),
    },
  }
}

export function createTunePreviewState(): TunePreviewState {
  return {
    angleDegrees: 0,
    angularRateDegreesPerSecond: 0,
    integralError: 0,
    targetAngleDegrees: 0,
    torqueTiltDegrees: 0,
    brakeTiltDegrees: 0,
    atrDegrees: 0,
    constantTiltbackDegrees: 0,
    variableTiltbackDegrees: 0,
    syntheticCurrentAmps: 0,
    erpm: 0,
    groundTravelMeters: 0,
    terrainSlope: 0,
    atrAccelDiff: 0,
    atrTargetDegrees: 0,
  }
}

export function speedKmhToReferenceErpm(speedKmh: number): number {
  return clamp(speedKmh, 0, 40) * REFERENCE_ERPM_PER_KMH
}

export function groundTravelToVisualOffset(groundTravelMeters: number): number {
  return (groundTravelMeters * 60) % 30
}

export function calculateLongitudinalTarget(
  state: Pick<TunePreviewState, 'torqueTiltDegrees' | 'brakeTiltDegrees'>,
  parameters: TunePreviewParameters,
  input: TunePreviewInput,
  elapsedSeconds: number,
): TunePreviewTarget {
  const riderLean = clamp(input.riderLean, -1, 1)
  const erpm = speedKmhToReferenceErpm(input.speedKmh)
  const syntheticCurrentAmps = riderLean * SYNTHETIC_CURRENT_AMPS
  const torqueTarget = torqueTiltTarget(parameters, syntheticCurrentAmps)
  const torqueRate = torqueTiltRate(state.torqueTiltDegrees, torqueTarget, parameters, erpm)
  const torqueTiltDegrees = moveTowards(
    state.torqueTiltDegrees,
    torqueTarget,
    torqueRate * elapsedSeconds,
  )

  const brakeTarget = brakeTiltTarget(parameters, riderLean, erpm)
  const brakeApplying = Math.abs(brakeTarget) > Math.abs(state.brakeTiltDegrees)
  const brakeRate = brakeApplying
    ? parameters.atrOnSpeed * 1.5
    : parameters.atrOffSpeed / Math.max(parameters.brakeTiltLingering, 1)
  const lowSpeedBrakeRate = erpm < 800 ? parameters.atrOnSpeed : brakeRate
  const brakeTiltDegrees = moveTowards(
    state.brakeTiltDegrees,
    brakeTarget,
    lowSpeedBrakeRate * (erpm < 500 ? 0.5 : 1) * elapsedSeconds,
  )

  const constantTiltbackDegrees =
    erpm >= parameters.tiltbackConstantErpm ? parameters.tiltbackConstant : 0
  const variableProgress = Math.max(erpm - parameters.tiltbackVariableErpm, 0) / 1000
  const variableMagnitude = Math.min(
    parameters.tiltbackVariable * variableProgress,
    Math.abs(parameters.tiltbackVariableMax),
  )
  const variableTiltbackDegrees = Math.sign(parameters.tiltbackVariableMax) * variableMagnitude
  const totalDegrees = clamp(
    torqueTiltDegrees + brakeTiltDegrees + constantTiltbackDegrees + variableTiltbackDegrees,
    -MAX_ANGLE_DEGREES,
    MAX_ANGLE_DEGREES,
  )

  return {
    torqueTiltDegrees,
    brakeTiltDegrees,
    atrDegrees: 0,
    constantTiltbackDegrees,
    variableTiltbackDegrees,
    totalDegrees,
    syntheticCurrentAmps,
    erpm,
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
    next = stepFixed(next, parameters, input, dt)
    remaining -= dt
  }
  return next
}

function stepFixed(
  state: TunePreviewState,
  parameters: TunePreviewParameters,
  input: TunePreviewInput,
  dt: number,
): TunePreviewState {
  const target = calculateLongitudinalTarget(state, parameters, input, dt)
  const terrainSlope = calculateTerrainSlope(state.groundTravelMeters, input)
  const braking = input.riderLean < 0
  const ratio = Math.max(braking ? parameters.atrAmpsDecelRatio : parameters.atrAmpsAccelRatio, 0.1)
  const expectedAcceleration = (target.syntheticCurrentAmps - 8) / ratio
  const rawAccelDiff = expectedAcceleration + terrainSlopeToSyntheticAcceleration(terrainSlope)
  const filterAlpha = clamp(dt * Math.max(parameters.atrFilter, 0.1), 0, 1)
  const atrAccelDiff = state.atrAccelDiff + (rawAccelDiff - state.atrAccelDiff) * filterAlpha
  let atrStrength = atrAccelDiff >= 0 ? parameters.atrStrengthUp : parameters.atrStrengthDown
  if (target.erpm > 3000 && !braking) {
    const span =
      Math.abs(parameters.atrSpeedBoost) > 0.4
        ? (Math.abs(parameters.atrSpeedBoost) - 0.4) * 5000 + 3000
        : 3000
    atrStrength *= 1 + Math.min(1, (target.erpm - 3000) / span) * parameters.atrSpeedBoost
  }
  const threshold = braking ? parameters.atrThresholdDown : parameters.atrThresholdUp
  const rawAtr = atrStrength * atrAccelDiff
  const thresholded = Math.abs(rawAtr) < threshold ? 0 : rawAtr - Math.sign(rawAtr) * threshold
  const atrTargetDegrees = clamp(
    state.atrTargetDegrees * 0.95 + thresholded * 0.05,
    -parameters.atrAngleLimit,
    parameters.atrAngleLimit,
  )
  let atrRate =
    Math.abs(atrTargetDegrees) > Math.abs(state.atrDegrees)
      ? parameters.atrOnSpeed
      : parameters.atrOffSpeed
  if (
    state.atrDegrees * atrTargetDegrees < 0 &&
    Math.abs(atrTargetDegrees - state.atrDegrees) > 2
  ) {
    atrRate *= parameters.atrTransitionBoost
  }
  if (target.erpm > 2500) atrRate *= parameters.atrResponseBoost
  if (target.erpm > 6000) atrRate *= parameters.atrResponseBoost
  const atrDegrees = moveTowards(state.atrDegrees, atrTargetDegrees, atrRate * dt)
  target.atrDegrees = atrDegrees
  target.totalDegrees = clamp(
    target.totalDegrees + atrDegrees,
    -MAX_ANGLE_DEGREES,
    MAX_ANGLE_DEGREES,
  )
  const error = state.angleDegrees - target.totalDegrees
  const integralError = clamp(state.integralError + error * dt, -20, 20)

  // Comparative ideal-drive response. Synthetic Rider Lean is an external pitch moment,
  // never an angle command. Coefficients normalize the bundled Refloat PID/filter ranges.
  const stiffness = clamp(parameters.kp, 0, 40) * 0.32
  const rateDamping = 1.6 + clamp(parameters.kp2, 0, 3) * 4.2
  const filterSoftness = 0.7 + clamp(parameters.mahonyKp, 0.2, 3) * 0.35
  const integralCorrection = clamp(parameters.ki, 0, 0.5) * integralError * 16
  const riderMoment = clamp(input.riderLean, -1, 1) * 34
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
    targetAngleDegrees: target.totalDegrees,
    torqueTiltDegrees: target.torqueTiltDegrees,
    brakeTiltDegrees: target.brakeTiltDegrees,
    atrDegrees,
    constantTiltbackDegrees: target.constantTiltbackDegrees,
    variableTiltbackDegrees: target.variableTiltbackDegrees,
    syntheticCurrentAmps: target.syntheticCurrentAmps,
    erpm: target.erpm,
    groundTravelMeters: state.groundTravelMeters + (clamp(input.speedKmh, 0, 40) / 3.6) * dt,
    terrainSlope,
    atrAccelDiff,
    atrTargetDegrees,
  }
}

export function calculateTerrainSlope(
  travelMeters: number,
  input: Pick<TunePreviewInput, 'hillsEnabled' | 'hillHeightMeters' | 'hillSpacingMeters'>,
): number {
  if (!input.hillsEnabled) return 0
  const height = clamp(input.hillHeightMeters ?? 5, 0, 20)
  const spacing = clamp(input.hillSpacingMeters ?? 8, 2, 100)
  const wave = (2 * Math.PI) / spacing
  return height * wave * Math.cos(travelMeters * wave)
}

export function terrainHeightRelativeToWheel(
  xPixels: number,
  travelMeters: number,
  heightMeters: number,
  spacingMeters: number,
): number {
  'worklet'
  const wave = (2 * Math.PI) / spacingMeters
  const visualAmplitude = Math.log1p(heightMeters) * 12
  const centerHeight = visualAmplitude * Math.sin(-travelMeters * wave)
  const pointHeight = visualAmplitude * Math.sin((xPixels / 60 - travelMeters) * wave)
  return pointHeight - centerHeight
}

export function terrainSlopeToSyntheticAcceleration(slope: number): number {
  return Math.asinh(slope) * 1.5
}

function torqueTiltTarget(parameters: TunePreviewParameters, currentAmps: number): number {
  const strength =
    currentAmps < 0 ? parameters.torqueTiltStrengthRegen : parameters.torqueTiltStrength
  const magnitude = Math.min(
    Math.max(Math.abs(currentAmps) - parameters.torqueTiltStartCurrent, 0) * strength,
    parameters.torqueTiltAngleLimit,
  )
  return Math.sign(currentAmps) * magnitude
}

function torqueTiltRate(
  current: number,
  target: number,
  parameters: TunePreviewParameters,
  erpm: number,
): number {
  let rate: number
  if (current * target < 0) {
    rate = Math.max(parameters.torqueTiltOffSpeed, parameters.torqueTiltOnSpeed)
  } else if (Math.abs(current) > Math.abs(target)) {
    rate = parameters.torqueTiltOffSpeed
  } else {
    rate = parameters.torqueTiltOnSpeed
  }
  return erpm < 500 ? rate / 2 : rate
}

function brakeTiltTarget(
  parameters: TunePreviewParameters,
  riderLean: number,
  erpm: number,
): number {
  if (parameters.brakeTiltStrength <= 0 || riderLean >= 0 || erpm <= 2000) return 0
  const factor = -(0.5 + (20 - parameters.brakeTiltStrength) / 5)
  return (riderLean * SYNTHETIC_BALANCE_OFFSET_DEGREES) / factor
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (maxDelta <= 0 || current === target) return current
  const delta = target - current
  if (Math.abs(delta) <= maxDelta) return target
  return current + Math.sign(delta) * maxDelta
}

function numberField(fields: Record<string, TuneProfileFieldValue>, id: string): number {
  return fields[id] as number
}

function numberFieldOrDefault(
  fields: Record<string, TuneProfileFieldValue>,
  id: string,
  fallback: number,
): number {
  const value = fields[id]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}
