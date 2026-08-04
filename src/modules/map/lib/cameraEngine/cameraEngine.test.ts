import { describe, expect, test } from 'bun:test'

import { createCameraEngine, type EngineCamera } from './engine'
import {
  createSpring,
  nearestBearingTarget,
  retargetSpring,
  shortestArcDelta,
  springSettled,
  stepSpring,
} from './springs'

const settle = (spring: ReturnType<typeof createSpring>, omega: number, seconds: number) => {
  let s = spring
  for (let t = 0; t < seconds; t += 1 / 60) s = stepSpring(s, omega, 1 / 60)
  return s
}

describe('spring', () => {
  test('converges to target without overshoot', () => {
    let s = retargetSpring(createSpring(0), 10)
    let previous = s.x
    for (let i = 0; i < 300; i++) {
      s = stepSpring(s, 6, 1 / 60)
      expect(s.x).toBeGreaterThanOrEqual(previous - 1e-9)
      expect(s.x).toBeLessThanOrEqual(10 + 1e-9)
      previous = s.x
    }
    expect(springSettled(s, 1e-3, 1e-3)).toBe(true)
  })

  test('retarget mid-flight keeps position and velocity continuous', () => {
    let s = retargetSpring(createSpring(0), 10)
    for (let i = 0; i < 20; i++) s = stepSpring(s, 6, 1 / 60)
    const { x: xBefore, v: vBefore } = s
    s = retargetSpring(s, -5)
    expect(s.x).toBe(xBefore)
    expect(s.v).toBe(vBefore)
    // One frame later position moved by roughly v·dt — no restart-from-rest jump.
    const next = stepSpring(s, 6, 1 / 60)
    expect(Math.abs(next.x - (xBefore + vBefore / 60))).toBeLessThan(Math.abs(vBefore / 60))
    expect(springSettled(settle(s, 6, 3), 1e-3, 1e-3)).toBe(true)
  })

  test('large dt stays stable (closed form, no explosion)', () => {
    let s = retargetSpring(createSpring(0), 10)
    s = stepSpring(s, 6, 5)
    expect(s.x).toBeCloseTo(10, 3)
    expect(Math.abs(s.v)).toBeLessThan(1e-3)
  })

  test('bearing wraps shortest arc', () => {
    expect(shortestArcDelta(359 - 1)).toBe(-2)
    expect(shortestArcDelta(1 - 359)).toBe(2)
    expect(nearestBearingTarget(359, 1)).toBe(361)
    expect(nearestBearingTarget(721, 359)).toBe(719)
  })
})

const createTestEngine = (options?: { teleportDistanceM?: number }) => {
  const frames: EngineCamera[] = []
  let pending: ((timestampMs: number) => void) | null = null
  let now = 0
  const engine = createCameraEngine({
    applyFrame: (camera) => frames.push(camera),
    teleportDistanceM: options?.teleportDistanceM,
    derivePitch: (zoom) => zoom * 2,
    scheduleFrame: (callback) => {
      pending = callback
      return 1
    },
    cancelFrame: () => {
      pending = null
    },
    now: () => now,
  })
  const advance = (ms: number) => {
    now += ms
  }
  const tick = (dtMs = 16) => {
    const callback = pending
    pending = null
    now += dtMs
    callback?.(now)
  }
  const run = (frameCount: number) => {
    for (let i = 0; i < frameCount && pending; i++) tick()
  }
  return { engine, frames, tick, run, advance, hasPending: () => pending != null }
}

const camera = (center: [number, number], zoom = 14, heading = 0, pitch = 0): EngineCamera => ({
  centerCoordinate: center,
  zoomLevel: zoom,
  heading,
  pitch,
})

describe('cameraEngine', () => {
  test('animates to target and idles exactly on it', () => {
    const { engine, frames, run, hasPending } = createTestEngine()
    engine.reset(camera([21, 52]))
    engine.setTarget({ center: [21.001, 52.001], zoom: 15 })
    run(600)
    expect(hasPending()).toBe(false)
    const final = engine.getCamera()
    expect(final.centerCoordinate[0]).toBe(21.001)
    expect(final.centerCoordinate[1]).toBe(52.001)
    expect(final.zoomLevel).toBe(15)
    expect(frames.length).toBeGreaterThan(10)
  })

  test('retarget mid-flight produces no frame-to-frame jump', () => {
    const { engine, frames, run } = createTestEngine()
    engine.reset(camera([21, 52]))
    engine.setTarget({ center: [21.002, 52] })
    run(10)
    engine.setTarget({ center: [20.998, 52] })
    run(600)
    let maxStep = 0
    for (let i = 1; i < frames.length; i++) {
      maxStep = Math.max(
        maxStep,
        Math.abs(frames[i]!.centerCoordinate[0] - frames[i - 1]!.centerCoordinate[0]),
      )
    }
    // Total travel ~0.003°; a restart-free path never moves more per frame
    // than the peak spring speed allows.
    expect(maxStep).toBeLessThan(0.0005)
    expect(engine.getCamera().centerCoordinate[0]).toBe(20.998)
  })

  test('teleport distance snaps instead of animating', () => {
    const { engine, frames, run, hasPending } = createTestEngine({ teleportDistanceM: 1000 })
    engine.reset(camera([21, 52]))
    engine.setTarget({ center: [22, 53] })
    expect(frames[0]!.centerCoordinate).toEqual([22, 53])
    run(600)
    expect(hasPending()).toBe(false)
  })

  test('pitch follows animated zoom via derivePitch', () => {
    const { engine, run } = createTestEngine()
    engine.reset(camera([21, 52], 10, 0, 20))
    engine.setTarget({ zoom: 12 })
    run(1000)
    expect(engine.getCamera().pitch).toBeCloseTo(24, 1)
  })

  test('external drive carries gesture velocity into the next target', () => {
    const { engine, run } = createTestEngine()
    engine.reset(camera([21, 52]))
    // Gesture moves east at 0.001°/frame.
    engine.driveExternal(camera([21.001, 52]), 1 / 60)
    engine.driveExternal(camera([21.002, 52]), 1 / 60)
    // Release back toward origin: first frames should keep drifting east
    // (momentum), not reverse instantly.
    engine.setTarget({ center: [21, 52] })
    run(2)
    expect(engine.getCamera().centerCoordinate[0]).toBeGreaterThan(21.002)
    run(1000)
    expect(engine.getCamera().centerCoordinate[0]).toBe(21)
  })

  test('untimed drive measures its own dt, so slow gestures carry less momentum', () => {
    const release = (sampleGapMs: number) => {
      const { engine, run, advance } = createTestEngine()
      engine.reset(camera([21, 52]))
      for (const longitude of [21.001, 21.002]) {
        advance(sampleGapMs)
        engine.driveExternal(camera([longitude, 52]))
      }
      engine.setTarget({ center: [21, 52] })
      run(2)
      return engine.getCamera().centerCoordinate[0]
    }
    // Same drag distance, four times slower: the overshoot past the release
    // point must shrink with the measured speed.
    expect(release(16) - 21.002).toBeGreaterThan(release(64) - 21.002)
  })

  test('first drive sample after a target parks instead of inheriting velocity', () => {
    const { engine, run, advance } = createTestEngine()
    engine.reset(camera([21, 52]))
    engine.setTarget({ center: [21.002, 52] })
    run(10)
    // A gesture grabs the flying camera; the opening sample has no velocity of
    // its own, so releasing it must not continue the old animation.
    advance(16)
    engine.driveExternal(camera([21.001, 52]))
    engine.setTarget({ center: [21.001, 52] })
    run(2)
    expect(engine.getCamera().centerCoordinate[0]).toBe(21.001)
  })

  test('ballistic transit dips zoom out and returns it on arrival', () => {
    const { engine, frames, run } = createTestEngine({ teleportDistanceM: 100_000 })
    engine.reset(camera([21, 52], 16))
    // ~3.4 km east: below teleport, far enough that zoom 16 can't see the target.
    engine.setTarget({ center: [21.05, 52] })
    run(2000)
    const minZoom = Math.min(...frames.map((f) => f.zoomLevel))
    expect(minZoom).toBeLessThan(15)
    expect(minZoom).toBeGreaterThan(10)
    expect(engine.getCamera().zoomLevel).toBe(16)
    expect(engine.getCamera().centerCoordinate[0]).toBe(21.05)
  })

  test('ballistic false keeps zoom pinned during transit', () => {
    const frames: EngineCamera[] = []
    let pending: ((timestampMs: number) => void) | null = null
    let now = 0
    const engine = createCameraEngine({
      applyFrame: (c) => frames.push(c),
      ballistic: false,
      teleportDistanceM: 100_000,
      scheduleFrame: (callback) => {
        pending = callback
        return 1
      },
      cancelFrame: () => {
        pending = null
      },
    })
    engine.reset(camera([21, 52], 16))
    engine.setTarget({ center: [21.05, 52] })
    for (let i = 0; i < 2000 && pending; i++) {
      const callback: (timestampMs: number) => void = pending
      pending = null
      now += 16
      callback(now)
    }
    expect(Math.min(...frames.map((f) => f.zoomLevel))).toBe(16)
  })

  test('heading crosses 0 via shortest arc', () => {
    const { engine, frames, run } = createTestEngine()
    engine.reset(camera([21, 52], 14, 350))
    engine.setTarget({ heading: 10 })
    run(600)
    expect(engine.getCamera().heading).toBeCloseTo(10, 2)
    for (const frame of frames) {
      const inArc = frame.heading >= 350 || frame.heading <= 10.001
      expect(inArc).toBe(true)
    }
  })
})
