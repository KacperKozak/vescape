import { describe, expect, test } from 'bun:test'

import {
  type DeviceMotionMeasurement,
  phoneHeadingFromDeviceMotion,
  phoneHeadingAnimationDuration,
  phoneHeadingSmoothingAlphaForTest,
  phoneHeadingUpdateIntervalMs,
  smoothPhoneHeading,
  startPhoneHeadingUpdates,
  type PhoneHeadingAdapter,
} from './phoneHeading'

const PORTRAIT = 0
const RIGHT_LANDSCAPE = 90

function motion(alpha: number, orientation = PORTRAIT): DeviceMotionMeasurement {
  return {
    rotation: { alpha, beta: 0, gamma: 0, timestamp: 0 },
    orientation,
  }
}

function fakeAdapter(options: { available?: boolean; permission?: string } = {}) {
  let listener: ((event: DeviceMotionMeasurement) => void) | null = null
  let removed = false
  const adapter: PhoneHeadingAdapter = {
    isAvailableAsync: async () => options.available ?? true,
    getPermissionsAsync: async () => ({ status: options.permission ?? 'granted' }) as never,
    requestPermissionsAsync: async () => ({ status: options.permission ?? 'granted' }) as never,
    setUpdateInterval: () => {},
    addListener(nextListener) {
      listener = nextListener
      return {
        remove() {
          removed = true
        },
      }
    },
  }
  return {
    adapter,
    emit: (event: DeviceMotionMeasurement) => listener?.(event),
    removed: () => removed,
  }
}

describe('phoneHeading', () => {
  test('normalizes fused device motion heading and screen orientation', () => {
    expect(phoneHeadingFromDeviceMotion(motion(-Math.PI / 2))).toBe(90)
    expect(phoneHeadingFromDeviceMotion(motion(Math.PI / 2))).toBe(270)
    expect(phoneHeadingFromDeviceMotion(motion(0, RIGHT_LANDSCAPE))).toBe(90)
  })

  test('smooths compass heading across the shortest wrap-around path', () => {
    expect(smoothPhoneHeading(null, 90)).toBe(90)
    expect(smoothPhoneHeading(350, 10)).toBeCloseTo(353.56)
    expect(smoothPhoneHeading(10, 350)).toBeCloseTo(6.44)
  })

  test('uses adaptive smoothing and no camera animation', () => {
    expect(phoneHeadingSmoothingAlphaForTest(0, 2)).toBeLessThan(
      phoneHeadingSmoothingAlphaForTest(0, 90),
    )
    expect(smoothPhoneHeading(0, 90)).toBeCloseTo(40.5)
    expect(smoothPhoneHeading(0, 90, 0.5)).toBeCloseTo(20.25)
    expect(phoneHeadingUpdateIntervalMs()).toBe(33)
    expect(phoneHeadingAnimationDuration()).toBe(0)
  })

  test('subscribes only after availability and permission checks', async () => {
    const source = fakeAdapter()
    const headings: number[] = []

    const subscription = await startPhoneHeadingUpdates(source.adapter, (heading) =>
      headings.push(heading),
    )
    source.emit(motion(Math.PI))
    subscription.remove()

    expect(subscription.status).toBe('ready')
    expect(headings).toEqual([180])
    expect(source.removed()).toBe(true)
  })

  test('returns fallback statuses without subscribing', async () => {
    const unavailable = await startPhoneHeadingUpdates(
      fakeAdapter({ available: false }).adapter,
      () => {},
    )
    const denied = await startPhoneHeadingUpdates(
      fakeAdapter({ permission: 'denied' }).adapter,
      () => {},
    )

    expect(unavailable.status).toBe('unavailable')
    expect(denied.status).toBe('denied')
  })
})
