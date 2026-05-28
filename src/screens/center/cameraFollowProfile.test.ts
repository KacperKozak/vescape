import { describe, expect, test } from 'bun:test'

import { getLiveFollowCameraProfile } from './cameraFollowProfile'

describe('live follow camera profile', () => {
  const gpsCamera = {
    centerCoordinate: [19, 50] as [number, number],
    zoomLevel: 13,
  }

  test('gps heading mode zooms in and increases pitch before direction exists', () => {
    expect(
      getLiveFollowCameraProfile({
        gpsCamera,
        followHeadingDeg: 0,
        gpsHeadingMode: true,
        perspectiveEnabled: true,
        viewportHeight: 1000,
      }),
    ).toMatchObject({
      centerCoordinate: [19, 50],
      zoomLevel: 16,
      heading: 0,
      pitch: 56,
      padding: {
        paddingTop: 200,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      },
    })
  })

  test('north-up follow keeps normal zoom profile and clears navigation padding', () => {
    expect(
      getLiveFollowCameraProfile({
        gpsCamera,
        followHeadingDeg: 0,
        gpsHeadingMode: false,
        perspectiveEnabled: true,
      }),
    ).toMatchObject({
      zoomLevel: 13,
      padding: {
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      },
    })
  })

  test('manual heading zoom can stay below heading-mode default minimum', () => {
    const profile = getLiveFollowCameraProfile({
      gpsCamera,
      followHeadingDeg: 90,
      gpsHeadingMode: true,
      perspectiveEnabled: true,
      enforceHeadingMinimums: false,
    })

    expect(profile.zoomLevel).toBe(13)
    expect(profile.pitch).toBeLessThan(56)
  })
})
