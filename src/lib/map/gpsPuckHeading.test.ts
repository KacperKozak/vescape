import { describe, expect, test } from 'bun:test'

import { getGpsPuckBearing } from './gpsPuckHeading'

describe('getGpsPuckBearing', () => {
  test.each(['northUp', 'freeRotate', 'phoneHeading'] as const)(
    'uses phone heading for the puck in %s mode',
    (navigationMode) => {
      expect(
        getGpsPuckBearing({
          navigationMode,
          approximateFix: false,
          phoneHeadingDeg: 42,
          gpsBearingDeg: 170,
        }),
      ).toBe(42)
    },
  )

  test('uses GPS course only in GPS heading mode', () => {
    expect(
      getGpsPuckBearing({
        navigationMode: 'gpsHeading',
        approximateFix: false,
        phoneHeadingDeg: 42,
        gpsBearingDeg: 170,
      }),
    ).toBe(170)
  })

  test('hides the arrow for an approximate fix', () => {
    expect(
      getGpsPuckBearing({
        navigationMode: 'northUp',
        approximateFix: true,
        phoneHeadingDeg: 42,
        gpsBearingDeg: 170,
      }),
    ).toBeNull()
  })
})
