import { Skia, type SkPath } from '@shopify/react-native-skia'

/**
 * One gauge arc, described by its center, radius and the angle range it sweeps
 * (radians, math convention: 0 = right, π = left, y grows upward).
 *
 * Every gauge variant in the app is a value of this type, so the path builders
 * below are shared by the quarter arcs and the half arc alike.
 */
export interface Arc {
  cx: number
  cy: number
  r: number
  from: number
  to: number
}

export const STROKE = 1

export function clamp01(f: number) {
  'worklet'
  return Math.min(1, Math.max(0, f))
}

export function normalizeFraction(value: number, min: number, max: number) {
  'worklet'
  const span = max - min
  if (span <= 0) return 0
  return clamp01((value - min) / span)
}

/** Point on `arc` at radius `r` and sweep fraction `f`. */
export function polar(arc: Arc, r: number, f: number) {
  'worklet'
  const angle = arc.from + (arc.to - arc.from) * f
  return { x: arc.cx + r * Math.cos(angle), y: arc.cy - r * Math.sin(angle) }
}

/** SVG sweep flag: y-down canvas flips the sense of a decreasing angle. */
function sweepFlag(arc: Arc) {
  'worklet'
  return arc.to < arc.from ? 1 : 0
}

export function arcPath(arc: Arc, fraction: number, r = arc.r) {
  'worklet'
  const start = polar(arc, r, 0)
  const end = polar(arc, r, clamp01(fraction))
  return `M ${start.x} ${start.y} A ${r} ${r} 0 0 ${sweepFlag(arc)} ${end.x} ${end.y}`
}

export function wedgePath(arc: Arc, fraction: number, r = arc.r) {
  'worklet'
  const c = clamp01(fraction)
  if (c <= 0) return ''
  const start = polar(arc, r, 0)
  const end = polar(arc, r, c)
  return `M ${arc.cx} ${arc.cy} L ${start.x} ${start.y} A ${r} ${r} 0 0 ${sweepFlag(arc)} ${end.x} ${end.y} Z`
}

/** Wedge between two fractions — used for alert ranges. */
export function rangeWedgePath(arc: Arc, fromFraction: number, toFraction: number) {
  'worklet'
  const from = clamp01(fromFraction)
  const to = clamp01(toFraction)
  if (to <= from) return ''
  const r = arc.r - STROKE / 2
  const start = polar(arc, r, from)
  const end = polar(arc, r, to)
  return `M ${arc.cx} ${arc.cy} L ${start.x} ${start.y} A ${r} ${r} 0 0 ${sweepFlag(arc)} ${end.x} ${end.y} Z`
}

/** Build an SkPath from an SVG path string (worklet-safe), never null. */
export function svgPath(d: string): SkPath {
  'worklet'
  return Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make()
}

/** Single straight segment as an SkPath. */
export function segmentPath(x1: number, y1: number, x2: number, y2: number): SkPath {
  'worklet'
  return Skia.PathBuilder.Make().moveTo(x1, y1).lineTo(x2, y2).detach()
}

/**
 * Radial segment across the arc stroke at `fraction`, extending `inset` inward.
 *
 * `outset` defaults inside the body on purpose: the Reanimated plugin only
 * captures closure values referenced in a worklet's body, so a module constant
 * used in a default parameter would be undefined on the UI runtime.
 */
export function radialTickPath(arc: Arc, fraction: number, inset: number, outset?: number) {
  'worklet'
  const out = outset ?? STROKE / 2
  const inner = polar(arc, arc.r - inset, fraction)
  const outer = polar(arc, arc.r + out, fraction)
  return segmentPath(inner.x, inner.y, outer.x, outer.y)
}
