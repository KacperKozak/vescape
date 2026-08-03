import { Images, ShapeSource, SymbolLayer, type Camera } from '@rnmapbox/maps'
import { memo, useEffect, useRef, type RefObject } from 'react'

import { theme } from '@/constants/theme'

import type { CameraSnapshot } from '@/modules/map/lib/cameraMotion'
import {
  deadBandPhoneHeading,
  startPhoneHeadingUpdates,
  type PhoneHeadingAdapter,
  type PhoneHeadingStatus,
} from '@/modules/map/lib/phoneHeading'

const GPS_HEADING_ICON_ID = 'center-phone-heading'
const GPS_HEADING_ICON = require('@rnmapbox/maps/src/assets/heading.png')

interface PhoneHeadingMapLayerProps {
  active: boolean
  /** Compass source. The caller picks it so a replay can supply a simulated one. */
  adapter: PhoneHeadingAdapter
  followCamera: boolean
  approximateFix: boolean
  coordinate: { longitude: number; latitude: number } | null
  cameraRef: RefObject<Camera | null>
  currentCameraRef: RefObject<CameraSnapshot | null>
  onHeadingChange: (headingDeg: number | null) => void
  onStatusChange: (status: PhoneHeadingStatus | 'idle') => void
}

/**
 * The cone's on-screen angle is the heading minus the camera bearing. While the camera follows the
 * heading those two are the same number, but they reach the map by different routes — the bearing
 * through `setCameraDirect`, the icon through a shape update — and land a frame apart, so a
 * continuously moving heading leaves the cone wobbling a few degrees around the puck. Following
 * means the answer is a constant: pin the icon to the viewport pointing up and the skew cannot
 * show. Only a camera that is not tracking the heading needs the map-space bearing.
 */
function phoneHeadingShape(
  coordinate: PhoneHeadingMapLayerProps['coordinate'],
  headingDeg: number | null,
  approximateFix: boolean,
  followCamera: boolean,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features:
      coordinate && headingDeg != null && !approximateFix
        ? [
            {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [coordinate.longitude, coordinate.latitude],
              },
              properties: { bearing: followCamera ? 0 : headingDeg },
            },
          ]
        : [],
  }
}

export const PhoneHeadingMapLayer = memo(function PhoneHeadingMapLayer({
  active,
  adapter,
  followCamera,
  approximateFix,
  coordinate,
  cameraRef,
  currentCameraRef,
  onHeadingChange,
  onStatusChange,
}: PhoneHeadingMapLayerProps) {
  const sourceRef = useRef<ShapeSource>(null)
  const headingDegRef = useRef<number | null>(null)
  const coordinateRef = useRef(coordinate)
  const approximateFixRef = useRef(approximateFix)
  const followCameraRef = useRef(followCamera)

  useEffect(() => {
    coordinateRef.current = coordinate
    approximateFixRef.current = approximateFix
    followCameraRef.current = followCamera
    sourceRef.current?.setNativeProps({
      id: 'center-phone-heading-source',
      shape: JSON.stringify(
        phoneHeadingShape(coordinate, headingDegRef.current, approximateFix, followCamera),
      ),
    })
  }, [approximateFix, coordinate, followCamera])

  useEffect(() => {
    if (!active) {
      headingDegRef.current = null
      onHeadingChange(null)
      onStatusChange('idle')
      sourceRef.current?.setNativeProps({
        id: 'center-phone-heading-source',
        shape: JSON.stringify(phoneHeadingShape(null, null, false, false)),
      })
      return
    }

    let disposed = false
    let remove: (() => void) | null = null

    void startPhoneHeadingUpdates(adapter, (rawHeadingDeg) => {
      if (disposed) return
      const headingDeg = deadBandPhoneHeading(headingDegRef.current, rawHeadingDeg)
      if (headingDeg === headingDegRef.current) return

      headingDegRef.current = headingDeg
      onHeadingChange(headingDeg)
      sourceRef.current?.setNativeProps({
        id: 'center-phone-heading-source',
        shape: JSON.stringify(
          phoneHeadingShape(
            coordinateRef.current,
            headingDeg,
            approximateFixRef.current,
            followCameraRef.current,
          ),
        ),
      })

      if (!followCameraRef.current) return
      const currentCamera = currentCameraRef.current
      if (currentCamera) currentCameraRef.current = { ...currentCamera, heading: headingDeg }
      cameraRef.current?.setCameraDirect({ heading: headingDeg })
    }).then((subscription) => {
      if (disposed) {
        subscription.remove()
        return
      }
      remove = subscription.remove
      onStatusChange(subscription.status)
    })

    return () => {
      disposed = true
      remove?.()
    }
  }, [active, adapter, cameraRef, currentCameraRef, onHeadingChange, onStatusChange])

  return (
    <>
      <Images images={{ [GPS_HEADING_ICON_ID]: { image: GPS_HEADING_ICON, sdf: true } }} />
      <ShapeSource
        ref={sourceRef}
        id="center-phone-heading-source"
        shape={phoneHeadingShape(coordinate, headingDegRef.current, approximateFix, followCamera)}
      >
        <SymbolLayer
          id="center-phone-heading-outline"
          style={{
            iconImage: GPS_HEADING_ICON_ID,
            iconRotate: ['get', 'bearing'],
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
            iconRotationAlignment: followCamera ? 'viewport' : 'map',
            iconSize: 0.95,
            iconOffset: [0, -10],
            iconColor: theme.palette.mono.white,
          }}
        />
      </ShapeSource>
    </>
  )
})
