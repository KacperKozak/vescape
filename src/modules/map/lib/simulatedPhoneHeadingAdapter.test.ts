import { describe, expect, test } from 'bun:test'

import { phoneHeadingFromDeviceMotion } from '@/modules/map/lib/phoneHeading'
import { createSimulatedPhoneHeadingAdapter } from '@/modules/map/lib/simulatedPhoneHeadingAdapter'

const INTERVAL_MS = 2

function collectHeadings(getHeadingDeg: () => number | null, ticks: number): Promise<number[]> {
  const adapter = createSimulatedPhoneHeadingAdapter(getHeadingDeg)
  adapter.setUpdateInterval(INTERVAL_MS)
  const decoded: number[] = []
  const subscription = adapter.addListener((event) => {
    const heading = phoneHeadingFromDeviceMotion(event)
    if (heading != null) decoded.push(heading)
  })
  return new Promise((resolve) => {
    setTimeout(
      () => {
        subscription.remove()
        resolve(decoded)
      },
      INTERVAL_MS * (ticks + 2),
    )
  })
}

describe('createSimulatedPhoneHeadingAdapter', () => {
  test('lands the first reading on the course, with no rotation to ease from', async () => {
    const decoded = await collectHeadings(() => 90, 4)

    expect(Math.round(decoded[0])).toBe(90)
  })

  test('eases toward a course that jumps instead of snapping to it', async () => {
    let heading = 0
    const decoded = await collectHeadings(() => {
      const next = heading
      heading = 90
      return next
    }, 6)

    // First tick pins to 0; the rest walk toward 90 without ever arriving in one step.
    expect(decoded[0]).toBe(0)
    expect(decoded[1]).toBeGreaterThan(0)
    expect(decoded[1]).toBeLessThan(10)
    expect(decoded.at(-1)).toBeLessThan(90)
    expect(decoded.at(-1)).toBeGreaterThan(decoded[1])
  })

  test('emits nothing while there is no heading to report', async () => {
    expect(await collectHeadings(() => null, 4)).toEqual([])
  })

  test('reports itself available and permitted, unlike an absent sensor', async () => {
    const adapter = createSimulatedPhoneHeadingAdapter(() => 0)

    expect(await adapter.isAvailableAsync()).toBe(true)
    expect((await adapter.getPermissionsAsync()).status).toBe('granted')
  })
})
