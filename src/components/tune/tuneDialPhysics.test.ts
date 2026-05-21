import { describe, expect, test } from 'bun:test'

import {
  computeDetentStrength,
  computeHapticStepSpacing,
  computeMomentumEmitStepIndex,
  computeThrowStartVelocity,
  computeTuneDialLayout,
  resolveThrowGestureVelocity,
  smoothThrowGestureVelocity,
  shouldPlayTuneDialHaptic,
} from './tuneDialPhysics'

const ranges = {
  small: { min: 0, max: 10, step: 0.5 },
  medium: { min: 0, max: 100, step: 1 },
  large: { min: -50, max: 50, step: 5 },
} as const

function layoutFor(name: keyof typeof ranges) {
  const range = ranges[name]
  return computeTuneDialLayout(range.min, range.max, range.step)
}

describe('TuneDial physics', () => {
  test('showcase ranges keep the same visual track width', () => {
    expect(layoutFor('small').totalWidth).toBe(700)
    expect(layoutFor('medium').totalWidth).toBe(700)
    expect(layoutFor('large').totalWidth).toBe(700)
  })

  test('short integer tune ranges label every step and render midpoint ticks', () => {
    const layout = computeTuneDialLayout(-5, 5, 1)

    expect(layout.stepPx).toBe(70)
    expect(layout.labelEveryStep).toBe(true)
    expect(layout.renderMidpointTicks).toBe(true)
  })

  test('denser ranges do not label every selectable step', () => {
    const layout = computeTuneDialLayout(0, 10, 0.5)

    expect(layout.stepPx).toBe(35)
    expect(layout.labelEveryStep).toBe(false)
    expect(layout.renderMidpointTicks).toBe(false)
  })

  test('haptic cadence follows the painted lines', () => {
    expect(computeHapticStepSpacing(layoutFor('small'))).toBe(2)
    expect(computeHapticStepSpacing(layoutFor('medium'))).toBe(10)
    expect(computeHapticStepSpacing(layoutFor('large'))).toBe(2)
    expect(computeHapticStepSpacing(computeTuneDialLayout(-5, 5, 1))).toBe(1)
  })

  test('haptics fire when movement crosses a painted label bucket', () => {
    expect(shouldPlayTuneDialHaptic(9, 10, 10)).toBe(true)
    expect(shouldPlayTuneDialHaptic(10, 12, 10)).toBe(false)
    expect(shouldPlayTuneDialHaptic(11, 9, 10)).toBe(true)
    expect(shouldPlayTuneDialHaptic(3, 4, 1)).toBe(true)
  })

  test('same gesture velocity starts with the same throw velocity across showcase ranges', () => {
    const gestureVelocityX = -1200

    expect(computeThrowStartVelocity(gestureVelocityX, layoutFor('small').totalWidth)).toBe(
      computeThrowStartVelocity(gestureVelocityX, layoutFor('medium').totalWidth),
    )
    expect(computeThrowStartVelocity(gestureVelocityX, layoutFor('medium').totalWidth)).toBe(
      computeThrowStartVelocity(gestureVelocityX, layoutFor('large').totalWidth),
    )
  })

  test('medium has no detent resistance during throw because it has too many stops', () => {
    expect(layoutFor('small').totalSteps).toBe(20)
    expect(layoutFor('medium').totalSteps).toBe(100)
    expect(layoutFor('large').totalSteps).toBe(20)

    expect(computeDetentStrength(layoutFor('small').totalSteps)).toBe(1)
    expect(computeDetentStrength(layoutFor('medium').totalSteps)).toBe(0)
    expect(computeDetentStrength(layoutFor('large').totalSteps)).toBe(1)
  })

  test('momentum emits value changes at the same visual cadence for dense and sparse dials', () => {
    const small = layoutFor('small')
    const medium = layoutFor('medium')
    const large = layoutFor('large')

    const smallEmits = new Set(
      Array.from({ length: small.totalSteps + 1 }, (_, stepIndex) =>
        computeMomentumEmitStepIndex(stepIndex, small.totalSteps),
      ),
    )
    const mediumEmits = new Set(
      Array.from({ length: medium.totalSteps + 1 }, (_, stepIndex) =>
        computeMomentumEmitStepIndex(stepIndex, medium.totalSteps),
      ),
    )
    const largeEmits = new Set(
      Array.from({ length: large.totalSteps + 1 }, (_, stepIndex) =>
        computeMomentumEmitStepIndex(stepIndex, large.totalSteps),
      ),
    )

    expect(smallEmits.size).toBe(21)
    expect(mediumEmits.size).toBe(21)
    expect(largeEmits.size).toBe(21)
  })

  test('throw velocity uses sampled motion when release velocity drops near zero', () => {
    let smoothedVelocityX = 0

    for (const velocityX of [-250, -600, -900, -700, -300]) {
      smoothedVelocityX = smoothThrowGestureVelocity(smoothedVelocityX, velocityX)
    }

    const resolved = resolveThrowGestureVelocity(-20, smoothedVelocityX, -42)

    expect(resolved).toBeLessThan(-400)
  })

  test('throw velocity ignores opposite release wobble after a clear movement direction', () => {
    const resolved = resolveThrowGestureVelocity(180, -500, -32)

    expect(resolved).toBeLessThan(0)
  })

  test('throw velocity caps one-frame release spikes against the sampled motion', () => {
    const resolved = resolveThrowGestureVelocity(-2000, -500, -28)

    expect(resolved).toBeGreaterThan(-700)
  })

  test('throw velocity expires after holding the dial still', () => {
    const resolved = resolveThrowGestureVelocity(-20, -500, -28, 240)

    expect(Math.abs(resolved)).toBeLessThan(30)
  })

  test('throw velocity partially fades during a short hold', () => {
    const fresh = resolveThrowGestureVelocity(-20, -500, -28, 0)
    const faded = resolveThrowGestureVelocity(-20, -500, -28, 100)

    expect(Math.abs(faded)).toBeLessThan(Math.abs(fresh))
    expect(Math.abs(faded)).toBeGreaterThan(100)
  })
})
