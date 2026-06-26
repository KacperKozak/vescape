import { describe, expect, test } from 'bun:test'

import { initialMapCameraControllerState, reduceMapCameraIntent } from './cameraController'

describe('map camera controller', () => {
  const gpsCamera = {
    centerCoordinate: [19, 50] as [number, number],
    zoomLevel: 13,
  }

  test('routes live follow through the GPS heading profile', () => {
    const result = reduceMapCameraIntent(initialMapCameraControllerState, {
      type: 'FollowLive',
      gpsCamera,
      followHeadingDeg: 91,
      navigationMode: 'gpsHeading',
      perspectiveEnabled: true,
      viewportHeight: 1000,
    })

    expect(result.state.mode).toEqual({ kind: 'liveFollow' })
    expect(result.effect?.camera).toMatchObject({
      centerCoordinate: [19, 50],
      zoomLevel: 16,
      heading: 91,
      pitch: 56,
      padding: {
        paddingTop: 200,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      },
    })
  })

  test('preserves heading for free rotate live follow', () => {
    const result = reduceMapCameraIntent(initialMapCameraControllerState, {
      type: 'FollowLive',
      gpsCamera,
      followHeadingDeg: 0,
      navigationMode: 'freeRotate',
      perspectiveEnabled: true,
      preserveHeading: 42,
    })

    expect(result.effect?.camera.heading).toBe(42)
  })

  test('manual browse exits live follow without producing a camera write', () => {
    const result = reduceMapCameraIntent(initialMapCameraControllerState, {
      type: 'BrowseManually',
    })

    expect(result.state.mode).toEqual({ kind: 'manualBrowse' })
    expect(result.effect).toBeNull()
  })

  test('perspective change recomputes pitch from the active profile', () => {
    const result = reduceMapCameraIntent(initialMapCameraControllerState, {
      type: 'ChangePerspective',
      enabled: true,
      currentCamera: {
        centerCoordinate: [19, 50],
        zoomLevel: 16,
        heading: 0,
        pitch: 0,
      },
      fallbackZoomLevel: 13,
      navigationMode: 'gpsHeading',
    })

    expect(result.effect?.camera).toEqual({ pitch: 56 })
  })
})
