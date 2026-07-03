import { describe, expect, test } from 'bun:test'

import {
  calculateLongitudinalTarget,
  calculateTerrainSlope,
  createTunePreviewModel,
  createTunePreviewState,
  groundTravelToVisualOffset,
  speedKmhToReferenceErpm,
  stepTunePreview,
} from '@/lib/tune/tunePreview'

const baseFields = {
  kp: 20,
  kp2: 0.6,
  ki: 0.02,
  mahony_kp: 2,
  torquetilt_strength: 0.1,
  torquetilt_strength_regen: 0.12,
  torquetilt_start_current: 15,
  torquetilt_angle_limit: 8,
  torquetilt_on_speed: 10,
  torquetilt_off_speed: 8,
  braketilt_strength: 10,
  braketilt_lingering: 2,
  atr_on_speed: 10,
  atr_off_speed: 8,
  atr_strength_up: 1.5,
  atr_strength_down: 1.5,
  atr_threshold_up: 1,
  atr_threshold_down: 1,
  atr_speed_boost: 0.3,
  atr_angle_limit: 8,
  atr_response_boost: 1.5,
  atr_transition_boost: 1.5,
  atr_filter: 5,
  atr_amps_accel_ratio: 8,
  atr_amps_decel_ratio: 8,
  tiltback_constant: 1,
  tiltback_constant_erpm: 500,
  tiltback_variable: 0.3,
  tiltback_variable_max: 3,
  tiltback_variable_erpm: 1000,
}

function readyParameters(fields: typeof baseFields = baseFields) {
  const model = createTunePreviewModel(fields)
  if (model.status !== 'ready') throw new Error('expected supported model')
  return model.parameters
}

function run(fields: typeof baseFields, riderLean = 0.8, speedKmh = 15, seconds = 2) {
  const parameters = readyParameters(fields)
  let state = createTunePreviewState()
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) {
    state = stepTunePreview(state, parameters, { riderLean, speedKmh }, 1 / 60)
  }
  return state
}

describe('Tune Preview longitudinal response', () => {
  test('repeats the same state sequence deterministically', () => {
    expect(run(baseFields)).toEqual(run(baseFields))
  })

  test('higher Aggressiveness resists the same sustained rider moment more strongly', () => {
    const low = { ...baseFields, kp: 15, kp2: 0.4, ki: 0.015, mahony_kp: 2.2 }
    const high = { ...baseFields, kp: 30, kp2: 1.1, ki: 0.03, mahony_kp: 1.5 }
    expect(Math.abs(run(high).angleDegrees - run(high).targetAngleDegrees)).toBeLessThan(
      Math.abs(run(low).angleDegrees - run(low).targetAngleDegrees),
    )
  })

  test('reports missing model fields instead of inventing defaults', () => {
    const model = createTunePreviewModel({ kp: 20 })
    expect(model.status).toBe('unsupported')
    if (model.status === 'unsupported') {
      expect(model.missingFields).toContain('torquetilt_strength')
      expect(model.missingFields).toContain('tiltback_variable_max')
    }
  })

  test('supports profiles saved before Tiltback ERPM thresholds were allowlisted', () => {
    const { tiltback_constant_erpm, tiltback_variable_erpm, ...legacyFields } = baseFields
    void tiltback_constant_erpm
    void tiltback_variable_erpm

    const model = createTunePreviewModel(legacyFields)
    expect(model.status).toBe('ready')
    if (model.status === 'ready') {
      expect(model.assumedFields).toEqual(['tiltback_constant_erpm', 'tiltback_variable_erpm'])
      expect(model.parameters.tiltbackConstantErpm).toBe(500)
      expect(model.parameters.tiltbackVariableErpm).toBe(0)
    }
  })

  test('maps the documented reference wheel speed to ERPM', () => {
    expect(speedKmhToReferenceErpm(3.5)).toBeCloseTo(1000)
    expect(speedKmhToReferenceErpm(-5)).toBe(0)
    expect(speedKmhToReferenceErpm(50)).toBeCloseTo(40_000 / 3.5)
  })

  test('moves ground right for forward travel when the Board nose points left', () => {
    expect(groundTravelToVisualOffset(0.1)).toBeGreaterThan(0)
  })

  test('flat terrain has no slope disturbance', () => {
    expect(calculateTerrainSlope(2, { hillsEnabled: false })).toBe(0)
  })

  test('taller and denser hills create stronger deterministic slope', () => {
    const gentle = calculateTerrainSlope(0, {
      hillsEnabled: true,
      hillHeightMeters: 0.3,
      hillSpacingMeters: 12,
    })
    const dense = calculateTerrainSlope(0, {
      hillsEnabled: true,
      hillHeightMeters: 1,
      hillSpacingMeters: 4,
    })
    expect(dense).toBeGreaterThan(gentle)
    expect(
      calculateTerrainSlope(0, { hillsEnabled: true, hillHeightMeters: 1, hillSpacingMeters: 4 }),
    ).toBe(dense)
  })

  test('terrain phase changes uphill and downhill signs', () => {
    const input = { hillsEnabled: true, hillHeightMeters: 1, hillSpacingMeters: 4 }
    expect(calculateTerrainSlope(0, input)).toBeGreaterThan(0)
    expect(calculateTerrainSlope(2, input)).toBeLessThan(0)
  })

  test('applies acceleration Torque Tilt above threshold and clamps its angle', () => {
    const parameters = readyParameters({ ...baseFields, torquetilt_angle_limit: 2 })
    const below = calculateLongitudinalTarget(
      createTunePreviewState(),
      parameters,
      { riderLean: 0.25, speedKmh: 15 },
      1,
    )
    const above = calculateLongitudinalTarget(
      createTunePreviewState(),
      parameters,
      { riderLean: 1, speedKmh: 15 },
      1,
    )
    expect(below.torqueTiltDegrees).toBe(0)
    expect(above.torqueTiltDegrees).toBe(2)
  })

  test('braking combines negative regen Torque Tilt with positive Brake Tilt', () => {
    const state = run(baseFields, -1, 15, 1)
    expect(state.torqueTiltDegrees).toBeLessThan(0)
    expect(state.brakeTiltDegrees).toBeGreaterThan(0)
    expect(state.targetAngleDegrees).toBeCloseTo(
      state.torqueTiltDegrees +
        state.brakeTiltDegrees +
        state.atrDegrees +
        state.constantTiltbackDegrees +
        state.variableTiltbackDegrees,
    )
  })

  test('Brake Tilt starts only above the bundled 2000 ERPM boundary', () => {
    expect(run(baseFields, -1, 7, 1).brakeTiltDegrees).toBe(0)
    expect(run(baseFields, -1, 7.1, 1).brakeTiltDegrees).toBeGreaterThan(0)
  })

  test('Brake Tilt lingering slows release', () => {
    const fastParameters = readyParameters({ ...baseFields, braketilt_lingering: 1 })
    const slowParameters = readyParameters({ ...baseFields, braketilt_lingering: 5 })
    const braking = run(baseFields, -1, 15, 1)
    const fast = stepTunePreview(braking, fastParameters, { riderLean: 0, speedKmh: 15 }, 0.1)
    const slow = stepTunePreview(braking, slowParameters, { riderLean: 0, speedKmh: 15 }, 0.1)
    expect(slow.brakeTiltDegrees).toBeGreaterThan(fast.brakeTiltDegrees)
  })

  test('constant and variable Tiltback respect start ERPM and maximum target', () => {
    const stopped = run(baseFields, 0, 0, 1)
    const fast = run(baseFields, 0, 40, 1)
    expect(stopped.constantTiltbackDegrees).toBe(0)
    expect(stopped.variableTiltbackDegrees).toBe(0)
    expect(fast.constantTiltbackDegrees).toBe(1)
    expect(fast.variableTiltbackDegrees).toBe(3)
  })

  test('zero and paused time do not advance response or ground', () => {
    const parameters = readyParameters()
    const state = createTunePreviewState()
    expect(stepTunePreview(state, parameters, { riderLean: 1, speedKmh: 15 }, 0)).toBe(state)
    expect(
      stepTunePreview(state, parameters, { riderLean: 1, speedKmh: 15, paused: true }, 1),
    ).toBe(state)
  })

  test('large deltas and extreme allowed values remain finite and bounded', () => {
    const parameters = readyParameters({
      ...baseFields,
      kp: 40,
      kp2: 3,
      ki: 0.5,
      mahony_kp: 0.2,
      torquetilt_strength: 1,
      torquetilt_strength_regen: 1,
      torquetilt_angle_limit: 30,
    })
    let state = createTunePreviewState()
    for (let index = 0; index < 100; index += 1) {
      state = stepTunePreview(
        state,
        parameters,
        { riderLean: index % 2 ? -1 : 1, speedKmh: 40 },
        30,
      )
    }
    expect(Object.values(state).every(Number.isFinite)).toBe(true)
    expect(Math.abs(state.angleDegrees)).toBeLessThanOrEqual(35)
    expect(Math.abs(state.targetAngleDegrees)).toBeLessThanOrEqual(35)
  })
})
