import { ArrowUpIcon, type Icon } from 'phosphor-react-native'
import { Pressable, StyleSheet, View } from 'react-native'
import Reanimated, {
  makeMutable,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'

import { theme } from '@/constants/theme'
import { isPointOutsideVisibleMapArea } from '@/helpers/mapGeometry'

import type { CameraSnapshot } from './useCameraControls'

export const GPS_POINT_COLOR = theme.map.user
export const GPS_POINT_TEXT_COLOR = theme.palette.purple.text
export const DESTINATION_POINT_COLOR = theme.map.target
export const DESTINATION_POINT_TEXT_COLOR = theme.palette.green.text

const OFFSCREEN_GPS_INDICATOR_SIZE = 64
const OFFSCREEN_GPS_EDGE_SIDE_INSET = 58
const OFFSCREEN_GPS_EDGE_TOP_INSET = 122
const OFFSCREEN_GPS_EDGE_BOTTOM_INSET = 142

interface MapLayout {
  width: number
  height: number
}

export interface OffscreenMapIndicatorState {
  id: string
  type: 'gps' | 'direction' | 'mapPoint' | 'riderTarget'
  coordinate: [number, number]
  color: string
  textColor: string
  icon: Icon
  x: SharedValue<number>
  y: SharedValue<number>
  angleDeg: SharedValue<number>
}

export interface OffscreenMapIndicatorDraft {
  id: string
  type: 'gps' | 'direction' | 'mapPoint' | 'riderTarget'
  coordinate: [number, number]
  color: string
  textColor: string
  icon: Icon
  x: number
  y: number
  angleDeg: number
}

function normalizeHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

function sameIndicatorIdentity(
  current: OffscreenMapIndicatorState[],
  next: OffscreenMapIndicatorDraft[],
) {
  if (current.length !== next.length) return false
  return next.every((nextIndicator, index) => {
    const currentIndicator = current[index]
    return (
      currentIndicator?.id === nextIndicator.id &&
      currentIndicator.type === nextIndicator.type &&
      currentIndicator.coordinate[0] === nextIndicator.coordinate[0] &&
      currentIndicator.coordinate[1] === nextIndicator.coordinate[1] &&
      currentIndicator.color === nextIndicator.color &&
      currentIndicator.textColor === nextIndicator.textColor &&
      currentIndicator.icon === nextIndicator.icon
    )
  })
}

export function clampedEdgeIndicator(
  trackedPoint: Pick<
    OffscreenMapIndicatorDraft,
    'id' | 'type' | 'coordinate' | 'color' | 'textColor' | 'icon'
  >,
  point: { x: number; y: number },
  layout: MapLayout,
): OffscreenMapIndicatorDraft | null {
  if (
    !isPointOutsideVisibleMapArea(point, layout, {
      top: OFFSCREEN_GPS_EDGE_TOP_INSET,
      bottom: OFFSCREEN_GPS_EDGE_BOTTOM_INSET,
    })
  ) {
    return null
  }

  const left = Math.min(OFFSCREEN_GPS_EDGE_SIDE_INSET, layout.width / 2)
  const right = Math.max(left, layout.width - OFFSCREEN_GPS_EDGE_SIDE_INSET)
  const top = Math.min(OFFSCREEN_GPS_EDGE_TOP_INSET, layout.height / 2)
  const bottom = Math.max(top, layout.height - OFFSCREEN_GPS_EDGE_BOTTOM_INSET)
  const centerX = layout.width / 2
  const centerY = layout.height / 2
  const deltaX = point.x - centerX
  const deltaY = point.y - centerY

  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || (deltaX === 0 && deltaY === 0)) {
    return null
  }

  const candidates = [
    deltaX < 0 ? (left - centerX) / deltaX : Number.POSITIVE_INFINITY,
    deltaX > 0 ? (right - centerX) / deltaX : Number.POSITIVE_INFINITY,
    deltaY < 0 ? (top - centerY) / deltaY : Number.POSITIVE_INFINITY,
    deltaY > 0 ? (bottom - centerY) / deltaY : Number.POSITIVE_INFINITY,
  ].filter((value) => value > 0)
  const scale = Math.min(...candidates)

  if (!Number.isFinite(scale)) return null

  return {
    ...trackedPoint,
    x: Math.min(right, Math.max(left, centerX + deltaX * scale)),
    y: Math.min(bottom, Math.max(top, centerY + deltaY * scale)),
    angleDeg: (Math.atan2(deltaX, -deltaY) * 180) / Math.PI,
  }
}

function bearingDeg(
  from: { longitude: number; latitude: number },
  to: { longitude: number; latitude: number },
) {
  const fromLat = (from.latitude * Math.PI) / 180
  const toLat = (to.latitude * Math.PI) / 180
  const deltaLon = ((to.longitude - from.longitude) * Math.PI) / 180
  const y = Math.sin(deltaLon) * Math.cos(toLat)
  const x =
    Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon)
  return normalizeHeading((Math.atan2(y, x) * 180) / Math.PI)
}

export function projectCoordinateToEdgePoint(
  coordinate: { longitude: number; latitude: number },
  camera: CameraSnapshot,
  layout: MapLayout,
) {
  const center = {
    longitude: camera.centerCoordinate[0],
    latitude: camera.centerCoordinate[1],
  }
  const angleRad = ((bearingDeg(center, coordinate) - camera.heading) * Math.PI) / 180
  const radius = Math.max(layout.width, layout.height)
  return {
    x: layout.width / 2 + Math.sin(angleRad) * radius,
    y: layout.height / 2 - Math.cos(angleRad) * radius,
  }
}

export function repositionOffscreenMapIndicators(
  current: OffscreenMapIndicatorState[],
  camera: CameraSnapshot,
  layout: MapLayout,
): OffscreenMapIndicatorState[] {
  const next = current.flatMap((indicator) => {
    const point = projectCoordinateToEdgePoint(
      { longitude: indicator.coordinate[0], latitude: indicator.coordinate[1] },
      camera,
      layout,
    )
    const positioned = clampedEdgeIndicator(indicator, point, layout)
    return positioned ? [positioned] : []
  })
  return applyOffscreenIndicatorDrafts(current, next)
}

function createOffscreenMapIndicatorState(
  draft: OffscreenMapIndicatorDraft,
): OffscreenMapIndicatorState {
  return {
    ...draft,
    x: makeMutable(draft.x),
    y: makeMutable(draft.y),
    angleDeg: makeMutable(draft.angleDeg),
  }
}

export function applyOffscreenIndicatorDrafts(
  current: OffscreenMapIndicatorState[],
  next: OffscreenMapIndicatorDraft[],
): OffscreenMapIndicatorState[] {
  if (!sameIndicatorIdentity(current, next)) {
    return next.map(createOffscreenMapIndicatorState)
  }

  for (let index = 0; index < next.length; index += 1) {
    const currentIndicator = current[index]
    const nextIndicator = next[index]
    currentIndicator.x.value = nextIndicator.x
    currentIndicator.y.value = nextIndicator.y
    currentIndicator.angleDeg.value = nextIndicator.angleDeg
  }
  return current
}

export function OffscreenMapIndicator({
  indicator,
  onPress,
}: {
  indicator: OffscreenMapIndicatorState
  onPress: () => void
}) {
  const IconComponent = indicator.icon
  const indicatorStyle = useAnimatedStyle(() => ({
    left: indicator.x.value - OFFSCREEN_GPS_INDICATOR_SIZE / 2,
    top: indicator.y.value - OFFSCREEN_GPS_INDICATOR_SIZE / 2,
  }))
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${indicator.angleDeg.value}deg` }],
  }))

  return (
    <Reanimated.View style={[styles.offscreenMapPosition, indicatorStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          indicator.type === 'gps'
            ? 'Recenter map on current position'
            : indicator.type === 'direction'
              ? 'Show direction point'
              : indicator.type === 'riderTarget'
                ? "Show rider's target"
                : 'Show selected map point'
        }
        onPress={onPress}
        style={({ pressed }) => [
          styles.offscreenMapIndicator,
          pressed && styles.offscreenMapIndicatorPressed,
        ]}
      >
        <Reanimated.View pointerEvents="none" style={[styles.offscreenMapArrowOrbit, arrowStyle]}>
          <ArrowUpIcon size={22} color={indicator.textColor} weight="bold" />
        </Reanimated.View>
        <View
          pointerEvents="none"
          style={[styles.offscreenMapIcon, { borderColor: indicator.color }]}
        >
          <IconComponent size={24} color={indicator.textColor} weight="bold" />
        </View>
      </Pressable>
    </Reanimated.View>
  )
}

const styles = StyleSheet.create({
  offscreenMapIndicator: {
    width: OFFSCREEN_GPS_INDICATOR_SIZE,
    height: OFFSCREEN_GPS_INDICATOR_SIZE,
    zIndex: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offscreenMapPosition: {
    position: 'absolute',
    width: OFFSCREEN_GPS_INDICATOR_SIZE,
    height: OFFSCREEN_GPS_INDICATOR_SIZE,
    zIndex: 6,
  },
  offscreenMapIndicatorPressed: {
    opacity: 0.55,
  },
  offscreenMapIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: GPS_POINT_COLOR,
    backgroundColor: theme.palette.slate.surfaceDeep,
    shadowColor: theme.palette.slate.surfaceDeep,
    shadowOpacity: 0.32,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  offscreenMapArrowOrbit: {
    position: 'absolute',
    width: OFFSCREEN_GPS_INDICATOR_SIZE,
    height: OFFSCREEN_GPS_INDICATOR_SIZE,
    alignItems: 'center',
  },
})
