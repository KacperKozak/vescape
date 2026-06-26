import { describe, expect, test } from 'bun:test'

import {
  getPaddingForProfile,
  getPitchForProfileZoom,
  getProfileZoomLevel,
  MAP_CAMERA_PROFILES,
} from './cameraProfiles'

describe('map camera profiles', () => {
  test('removes tilt at far zoom for every profile', () => {
    for (const profile of Object.keys(MAP_CAMERA_PROFILES) as Array<
      keyof typeof MAP_CAMERA_PROFILES
    >) {
      expect(
        getPitchForProfileZoom({
          profile,
          zoom: 10,
          perspectiveEnabled: true,
          enforceMinimums: false,
        }),
      ).toBe(0)
    }
  })

  test('uses profile-specific maximum pitch at close zoom', () => {
    expect(
      getPitchForProfileZoom({
        profile: 'northUp',
        zoom: 17,
        perspectiveEnabled: true,
        enforceMinimums: false,
      }),
    ).toBe(MAP_CAMERA_PROFILES.northUp.maxPitch)
    expect(
      getPitchForProfileZoom({
        profile: 'rideHistory',
        zoom: 17,
        perspectiveEnabled: true,
        enforceMinimums: false,
      }),
    ).toBe(MAP_CAMERA_PROFILES.rideHistory.maxPitch)
    expect(
      getPitchForProfileZoom({
        profile: 'weather',
        zoom: 17,
        perspectiveEnabled: true,
        enforceMinimums: false,
      }),
    ).toBe(0)
  })

  test('keeps GPS heading and Compass as distinct follow profiles', () => {
    expect(MAP_CAMERA_PROFILES.gpsHeading).toMatchObject({
      headingPolicy: 'gpsHeading',
      maxPitch: 56,
      minimumPitch: 56,
    })
    expect(MAP_CAMERA_PROFILES.compass).toMatchObject({
      headingPolicy: 'compass',
      maxPitch: 52,
      minimumPitch: 52,
    })
  })

  test('derives heading profile zoom and padding minimums centrally', () => {
    expect(getProfileZoomLevel({ profile: 'gpsHeading', zoom: 13 })).toBe(16)
    expect(getPaddingForProfile({ profile: 'gpsHeading', viewportHeight: 1000 })).toEqual({
      paddingTop: 200,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
    })
  })
})
