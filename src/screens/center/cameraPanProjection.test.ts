import { describe, expect, test } from 'bun:test'

import { getCameraAfterScreenDrag, type CameraPanSnapshot } from './cameraPanProjection'

function camera(heading: number): CameraPanSnapshot {
  return {
    centerCoordinate: [0, 0],
    zoomLevel: 10,
    heading,
    pitch: 0,
  }
}

function deltaFrom(base: CameraPanSnapshot, next: CameraPanSnapshot) {
  return {
    longitude: next.centerCoordinate[0] - base.centerCoordinate[0],
    latitude: next.centerCoordinate[1] - base.centerCoordinate[1],
  }
}

describe('camera pan projection', () => {
  test('dragging right moves the artificial reveal camera west in north-up mode', () => {
    const base = camera(0)
    const delta = deltaFrom(base, getCameraAfterScreenDrag(base, 100, 0))

    expect(delta.longitude).toBeLessThan(0)
    expect(Math.abs(delta.latitude)).toBeLessThan(0.000001)
  })

  test('dragging right follows the rotated map local axis in heading mode', () => {
    const base = camera(90)
    const delta = deltaFrom(base, getCameraAfterScreenDrag(base, 100, 0))

    expect(delta.latitude).toBeGreaterThan(0)
    expect(Math.abs(delta.longitude)).toBeLessThan(0.000001)
  })

  test('west-facing right drag follows the rotated map local axis', () => {
    const base = camera(270)
    const delta = deltaFrom(base, getCameraAfterScreenDrag(base, 100, 0))

    expect(delta.latitude).toBeLessThan(0)
    expect(Math.abs(delta.longitude)).toBeLessThan(0.000001)
  })

  test('dragging down follows the rotated map local axis', () => {
    const base = camera(270)
    const delta = deltaFrom(base, getCameraAfterScreenDrag(base, 0, 100))

    expect(delta.longitude).toBeLessThan(0)
    expect(Math.abs(delta.latitude)).toBeLessThan(0.000001)
  })
})
