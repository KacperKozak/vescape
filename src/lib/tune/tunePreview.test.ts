import { describe, expect, test } from 'bun:test'

import {
  createTunePreviewModel,
  createTunePreviewState,
  stepTunePreview,
} from '@/lib/tune/tunePreview'

const lowFields = { kp: 15, kp2: 0.4, ki: 0.015, mahony_kp: 2.2 }
const highFields = { kp: 30, kp2: 1.1, ki: 0.03, mahony_kp: 1.5 }

function readyParameters(fields: typeof lowFields) {
  const model = createTunePreviewModel(fields)
  if (model.status !== 'ready') throw new Error('expected supported model')
  return model.parameters
}

function run(fields: typeof lowFields, seconds = 2) {
  const parameters = readyParameters(fields)
  let state = createTunePreviewState()
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) {
    state = stepTunePreview(state, parameters, { riderLean: 0.8 }, 1 / 60)
  }
  return state
}

describe('Tune Preview flat response', () => {
  test('repeats the same state sequence deterministically', () => {
    expect(run(lowFields)).toEqual(run(lowFields))
  })

  test('higher Aggressiveness resists the same sustained rider moment more strongly', () => {
    expect(Math.abs(run(highFields).angleDegrees)).toBeLessThan(
      Math.abs(run(lowFields).angleDegrees),
    )
  })

  test('reports missing model fields instead of inventing defaults', () => {
    expect(createTunePreviewModel({ kp: 20 })).toEqual({
      status: 'unsupported',
      modelVersion: 'refloat-bundled-legacy-v1',
      missingFields: ['kp2', 'ki', 'mahony_kp'],
    })
  })

  test('zero and paused time do not advance state', () => {
    const parameters = readyParameters(lowFields)
    const state = createTunePreviewState()
    expect(stepTunePreview(state, parameters, { riderLean: 1 }, 0)).toBe(state)
    expect(stepTunePreview(state, parameters, { riderLean: 1, paused: true }, 1)).toBe(state)
  })

  test('large deltas and extreme allowed values remain finite and bounded', () => {
    const parameters = readyParameters({ kp: 40, kp2: 3, ki: 0.5, mahony_kp: 0.2 })
    let state = createTunePreviewState()
    for (let index = 0; index < 100; index += 1) {
      state = stepTunePreview(state, parameters, { riderLean: index % 2 ? -1 : 1 }, 30)
    }
    expect(Object.values(state).every(Number.isFinite)).toBe(true)
    expect(Math.abs(state.angleDegrees)).toBeLessThanOrEqual(35)
  })
})
