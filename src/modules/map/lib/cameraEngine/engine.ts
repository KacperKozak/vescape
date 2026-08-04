import { distanceMeters } from '@/helpers/mapGeometry'

import {
  createSpring,
  driveSpring,
  nearestBearingTarget,
  normalizeBearing,
  retargetSpring,
  snapSpring,
  springSettled,
  stepSpring,
  type SpringState,
} from './springs'

export interface EngineCamera {
  centerCoordinate: [number, number]
  zoomLevel: number
  heading: number
  pitch: number
}

export interface CameraEngineTarget {
  center?: [number, number]
  zoom?: number
  heading?: number
  /** Explicit pitch target; when omitted and `derivePitch` is configured, pitch follows zoom. */
  pitch?: number
}

export interface CameraEngineConfig {
  /** Called once per frame while any spring is in motion. */
  applyFrame: (camera: EngineCamera) => void
  /** Stiffness per axis, rad/s. */
  omega?: Partial<CameraEngineOmega>
  /** Pitch derived from the animated zoom each frame, unless a pitch target was set explicitly. */
  derivePitch?: (zoom: number) => number
  /** Center retargets farther than this snap instead of animating. */
  teleportDistanceM?: number
  /**
   * Ballistic transit zoom: while the center is still far from its target, the
   * zoom target is capped so the remaining travel fits ~`fitPx` screen pixels,
   * then released back to the requested zoom as the center arrives — a smooth
   * out-and-back arc for mid-distance jumps. Pass `false` to disable.
   */
  ballistic?: { fitPx?: number; minZoom?: number } | false
  /** Injectable for tests. Defaults to requestAnimationFrame. */
  scheduleFrame?: (callback: (timestampMs: number) => void) => number
  cancelFrame?: (handle: number) => void
}

export interface CameraEngineOmega {
  center: number
  zoom: number
  heading: number
  pitch: number
}

export const CAMERA_ENGINE_DEFAULT_OMEGA: CameraEngineOmega = {
  center: 6,
  zoom: 5,
  heading: 8,
  pitch: 5,
}

export const CAMERA_ENGINE_DEFAULT_TELEPORT_DISTANCE_M = 10_000
export const CAMERA_ENGINE_DEFAULT_BALLISTIC_FIT_PX = 320
export const CAMERA_ENGINE_DEFAULT_BALLISTIC_MIN_ZOOM = 3

/** Web-mercator meters per pixel at zoom 0 (256px tiles). */
const METERS_PER_PIXEL_ZOOM_0 = 156_543.033_92

/** Zoom at which `distanceM` spans `fitPx` screen pixels at this latitude. */
function zoomToFitDistance(distanceM: number, latitudeDeg: number, fitPx: number): number {
  if (distanceM <= 0) return Number.POSITIVE_INFINITY
  const metersPerPixelAtZoom0 = METERS_PER_PIXEL_ZOOM_0 * Math.cos((latitudeDeg * Math.PI) / 180)
  return Math.log2((metersPerPixelAtZoom0 * fitPx) / distanceM)
}

const MAX_FRAME_DT_S = 0.064
const CENTER_EPSILON_DEG = 1e-7
const ZOOM_EPSILON = 1e-4
const ANGLE_EPSILON_DEG = 1e-3

interface EngineSprings {
  lng: SpringState
  lat: SpringState
  zoom: SpringState
  heading: SpringState
  pitch: SpringState
}

export interface CameraEngine {
  /** Initialize springs at rest on a known camera. Until called, targets snap. */
  reset: (camera: EngineCamera) => void
  /** Retarget springs; motion continues from current position and velocity. */
  setTarget: (target: CameraEngineTarget) => void
  /** Jump instantly, killing velocity on the snapped axes. */
  snap: (target: CameraEngineTarget) => void
  /**
   * Gesture pass-through: camera is externally positioned this frame. Springs
   * shadow-track position and velocity so the next setTarget blends out of the
   * gesture without a jump. Does not call applyFrame — the driver already owns
   * the camera.
   */
  driveExternal: (camera: EngineCamera, dtSeconds: number) => void
  /** True while the frame loop is running. */
  isAnimating: () => boolean
  getCamera: () => EngineCamera
  destroy: () => void
}

export function createCameraEngine(config: CameraEngineConfig): CameraEngine {
  const omega: CameraEngineOmega = { ...CAMERA_ENGINE_DEFAULT_OMEGA, ...config.omega }
  const teleportDistanceM = config.teleportDistanceM ?? CAMERA_ENGINE_DEFAULT_TELEPORT_DISTANCE_M
  const scheduleFrame =
    config.scheduleFrame ?? ((callback) => requestAnimationFrame(callback) as unknown as number)
  const cancelFrame =
    config.cancelFrame ?? ((handle) => cancelAnimationFrame(handle as unknown as number))

  const ballistic =
    config.ballistic === false
      ? null
      : {
          fitPx: config.ballistic?.fitPx ?? CAMERA_ENGINE_DEFAULT_BALLISTIC_FIT_PX,
          minZoom: config.ballistic?.minZoom ?? CAMERA_ENGINE_DEFAULT_BALLISTIC_MIN_ZOOM,
        }

  let springs: EngineSprings | null = null
  /** The zoom the caller asked for; the ballistic cap adjusts around it. */
  let zoomUserTarget = 0
  let pitchFollowsZoom = config.derivePitch != null
  let frameHandle: number | null = null
  let lastFrameMs: number | null = null
  let destroyed = false

  const toCamera = (s: EngineSprings): EngineCamera => ({
    centerCoordinate: [s.lng.x, s.lat.x],
    zoomLevel: s.zoom.x,
    heading: normalizeBearing(s.heading.x),
    pitch: s.pitch.x,
  })

  const settled = (s: EngineSprings) =>
    springSettled(s.lng, CENTER_EPSILON_DEG, CENTER_EPSILON_DEG) &&
    springSettled(s.lat, CENTER_EPSILON_DEG, CENTER_EPSILON_DEG) &&
    springSettled(s.zoom, ZOOM_EPSILON, ZOOM_EPSILON) &&
    springSettled(s.heading, ANGLE_EPSILON_DEG, ANGLE_EPSILON_DEG) &&
    springSettled(s.pitch, ANGLE_EPSILON_DEG, ANGLE_EPSILON_DEG)

  const stopLoop = () => {
    if (frameHandle != null) cancelFrame(frameHandle)
    frameHandle = null
    lastFrameMs = null
  }

  const frame = (timestampMs: number) => {
    frameHandle = null
    if (destroyed || !springs) return
    const dt = Math.min(
      lastFrameMs == null ? 1 / 60 : Math.max(0, (timestampMs - lastFrameMs) / 1000),
      MAX_FRAME_DT_S,
    )
    lastFrameMs = timestampMs

    let s = springs
    if (ballistic) {
      const remainingM = distanceMeters(
        { longitude: s.lng.x, latitude: s.lat.x },
        { longitude: s.lng.target, latitude: s.lat.target },
      )
      const fitZoom = zoomToFitDistance(remainingM, s.lat.x, ballistic.fitPx)
      s.zoom = retargetSpring(
        s.zoom,
        Math.min(zoomUserTarget, Math.max(fitZoom, ballistic.minZoom)),
      )
    }
    s = {
      lng: stepSpring(s.lng, omega.center, dt),
      lat: stepSpring(s.lat, omega.center, dt),
      zoom: stepSpring(s.zoom, omega.zoom, dt),
      heading: stepSpring(s.heading, omega.heading, dt),
      pitch: stepSpring(s.pitch, omega.pitch, dt),
    }
    if (pitchFollowsZoom && config.derivePitch) {
      s.pitch = retargetSpring(s.pitch, config.derivePitch(s.zoom.x))
    }
    springs = s
    config.applyFrame(toCamera(s))

    if (settled(s)) {
      // Land exactly on target so the map doesn't rest epsilon off.
      springs = {
        lng: snapSpring(s.lng, s.lng.target),
        lat: snapSpring(s.lat, s.lat.target),
        zoom: snapSpring(s.zoom, s.zoom.target),
        heading: snapSpring(s.heading, s.heading.target),
        pitch: snapSpring(s.pitch, s.pitch.target),
      }
      config.applyFrame(toCamera(springs))
      lastFrameMs = null
      return
    }
    frameHandle = scheduleFrame(frame)
  }

  const ensureLoop = () => {
    if (destroyed || frameHandle != null) return
    if (springs && settled(springs)) return
    frameHandle = scheduleFrame(frame)
  }

  const resolvePitchTarget = (target: CameraEngineTarget, zoomTarget: number) => {
    if (target.pitch != null) {
      pitchFollowsZoom = false
      return target.pitch
    }
    if (config.derivePitch) {
      pitchFollowsZoom = true
      return config.derivePitch(zoomTarget)
    }
    return null
  }

  const reset = (camera: EngineCamera) => {
    stopLoop()
    zoomUserTarget = camera.zoomLevel
    springs = {
      lng: createSpring(camera.centerCoordinate[0]),
      lat: createSpring(camera.centerCoordinate[1]),
      zoom: createSpring(camera.zoomLevel),
      heading: createSpring(camera.heading),
      pitch: createSpring(camera.pitch),
    }
  }

  const snap = (target: CameraEngineTarget) => {
    if (!springs) return
    const s = springs
    if (target.zoom != null) zoomUserTarget = target.zoom
    const zoomTarget = target.zoom ?? zoomUserTarget
    const pitchTarget = resolvePitchTarget(target, zoomTarget)
    springs = {
      lng: target.center ? snapSpring(s.lng, target.center[0]) : s.lng,
      lat: target.center ? snapSpring(s.lat, target.center[1]) : s.lat,
      zoom: target.zoom != null ? snapSpring(s.zoom, target.zoom) : s.zoom,
      heading:
        target.heading != null
          ? snapSpring(s.heading, nearestBearingTarget(s.heading.x, target.heading))
          : s.heading,
      pitch: pitchTarget != null ? snapSpring(s.pitch, pitchTarget) : s.pitch,
    }
    config.applyFrame(toCamera(springs))
    ensureLoop()
  }

  const setTarget = (target: CameraEngineTarget) => {
    if (!springs) return
    if (target.center) {
      const from = { longitude: springs.lng.x, latitude: springs.lat.x }
      const to = { longitude: target.center[0], latitude: target.center[1] }
      if (distanceMeters(from, to) > teleportDistanceM) {
        snap(target)
        return
      }
    }
    const s = springs
    if (target.zoom != null) zoomUserTarget = target.zoom
    const zoomTarget = target.zoom ?? zoomUserTarget
    const pitchTarget = resolvePitchTarget(target, zoomTarget)
    springs = {
      lng: target.center ? retargetSpring(s.lng, target.center[0]) : s.lng,
      lat: target.center ? retargetSpring(s.lat, target.center[1]) : s.lat,
      zoom: target.zoom != null ? retargetSpring(s.zoom, target.zoom) : s.zoom,
      heading:
        target.heading != null
          ? retargetSpring(s.heading, nearestBearingTarget(s.heading.x, target.heading))
          : s.heading,
      pitch: pitchTarget != null ? retargetSpring(s.pitch, pitchTarget) : s.pitch,
    }
    ensureLoop()
  }

  const driveExternal = (camera: EngineCamera, dtSeconds: number) => {
    if (!springs) {
      reset(camera)
      return
    }
    stopLoop()
    zoomUserTarget = camera.zoomLevel
    const s = springs
    springs = {
      lng: driveSpring(s.lng, camera.centerCoordinate[0], dtSeconds),
      lat: driveSpring(s.lat, camera.centerCoordinate[1], dtSeconds),
      zoom: driveSpring(s.zoom, camera.zoomLevel, dtSeconds),
      heading: driveSpring(s.heading, nearestBearingTarget(s.heading.x, camera.heading), dtSeconds),
      pitch: driveSpring(s.pitch, camera.pitch, dtSeconds),
    }
  }

  return {
    reset,
    setTarget,
    snap,
    driveExternal,
    isAnimating: () => frameHandle != null,
    getCamera: () => {
      if (!springs) throw new Error('CameraEngine.getCamera called before reset')
      return toCamera(springs)
    },
    destroy: () => {
      destroyed = true
      stopLoop()
    },
  }
}
