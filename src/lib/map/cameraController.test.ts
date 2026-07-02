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

  test('refines ride history preview to route for the same selection', () => {
    const preview = reduceMapCameraIntent(initialMapCameraControllerState, {
      type: 'FrameRideHistoryPreview',
      selectionKey: 'ride-1',
      camera: {
        centerCoordinate: [19, 50],
        zoomLevel: 11,
        heading: 0,
        pitch: 0,
      },
    })
    const route = reduceMapCameraIntent(preview.state, {
      type: 'RefineRideHistoryRoute',
      selectionKey: 'ride-1',
      camera: {
        centerCoordinate: [19.1, 50.1],
        zoomLevel: 12,
        heading: 0,
        pitch: 0,
      },
    })

    expect(route.state.mode).toEqual({
      kind: 'rideHistory',
      selectionKey: 'ride-1',
      phase: 'route',
    })
    expect(route.effect?.camera.centerCoordinate).toEqual([19.1, 50.1])
  })

  test('ignores stale ride history route refinement', () => {
    const preview = reduceMapCameraIntent(initialMapCameraControllerState, {
      type: 'FrameRideHistoryPreview',
      selectionKey: 'ride-1',
      camera: {
        centerCoordinate: [19, 50],
        zoomLevel: 11,
        heading: 0,
        pitch: 0,
      },
    })
    const route = reduceMapCameraIntent(preview.state, {
      type: 'RefineRideHistoryRoute',
      selectionKey: 'ride-2',
      camera: {
        centerCoordinate: [20, 51],
        zoomLevel: 12,
        heading: 0,
        pitch: 0,
      },
    })

    expect(route.state).toEqual(preview.state)
    expect(route.effect).toBeNull()
  })

  test('manual ride history browse cancels automatic route refinement', () => {
    const preview = reduceMapCameraIntent(initialMapCameraControllerState, {
      type: 'FrameRideHistoryPreview',
      selectionKey: 'ride-1',
      camera: {
        centerCoordinate: [19, 50],
        zoomLevel: 11,
        heading: 0,
        pitch: 0,
      },
    })
    const manual = reduceMapCameraIntent(preview.state, {
      type: 'BrowseManually',
      historySelectionKey: 'ride-1',
    })
    const route = reduceMapCameraIntent(manual.state, {
      type: 'RefineRideHistoryRoute',
      selectionKey: 'ride-1',
      camera: {
        centerCoordinate: [19.1, 50.1],
        zoomLevel: 12,
        heading: 0,
        pitch: 0,
      },
    })

    expect(route.state.mode).toEqual({
      kind: 'rideHistory',
      selectionKey: 'ride-1',
      phase: 'manualInspect',
    })
    expect(route.effect).toBeNull()
  })

  test('weather view keeps current center and uses flat weather profile', () => {
    const result = reduceMapCameraIntent(initialMapCameraControllerState, {
      type: 'EnterWeatherView',
      currentCamera: {
        centerCoordinate: [19, 50],
        zoomLevel: 14,
        heading: 37,
        pitch: 45,
      },
      fallbackCenterCoordinate: [15, 54],
      perspectiveEnabled: true,
    })

    expect(result.effect?.camera).toEqual({
      centerCoordinate: [19, 50],
      zoomLevel: 8,
      heading: 0,
      pitch: 0,
    })
  })

  test('map point focus recomputes pitch from profile and zoom', () => {
    const result = reduceMapCameraIntent(initialMapCameraControllerState, {
      type: 'FocusCoordinate',
      coordinate: [20, 51],
      currentCamera: {
        centerCoordinate: [19, 50],
        zoomLevel: 16,
        heading: 33,
        pitch: 3,
      },
      fallbackZoomLevel: 13,
      navigationMode: 'northUp',
      perspectiveEnabled: true,
    })

    expect(result.state.mode).toEqual({ kind: 'manualBrowse' })
    expect(result.effect?.camera).toEqual({
      centerCoordinate: [20, 51],
      zoomLevel: 16,
      heading: 0,
      pitch: 45,
    })
  })
})
