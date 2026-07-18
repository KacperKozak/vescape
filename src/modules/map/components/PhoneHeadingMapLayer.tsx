import { Images, ShapeSource, SymbolLayer, type Camera } from '@rnmapbox/maps'
import { memo, useEffect, useRef, type RefObject } from 'react'

import { theme } from '@/constants/theme'

import type { CameraSnapshot } from '@/screens/center/useCameraControls'
import {
  deadBandPhoneHeading,
  startPhoneHeadingUpdates,
  type PhoneHeadingStatus,
} from '@/modules/map/lib/phoneHeading'
import { deviceMotionPhoneHeadingAdapter } from '@/modules/map/lib/deviceMotionPhoneHeadingAdapter'

const GPS_HEADING_ICON_ID = 'center-phone-heading'
const GPS_HEADING_ICON = require('@rnmapbox/maps/src/assets/heading.png')

interface PhoneHeadingMapLayerProps {
  active: boolean
  followCamera: boolean
  approximateFix: boolean
  coordinate: { longitude: number; latitude: number } | null
  cameraRef: RefObject<Camera | null>
  currentCameraRef: RefObject<CameraSnapshot | null>
  onHeadingChange: (headingDeg: number | null) => void
  onStatusChange: (status: PhoneHeadingStatus | 'idle') => void
}

function phoneHeadingShape(
  coordinate: PhoneHeadingMapLayerProps['coordinate'],
  headingDeg: number | null,
  approximateFix: boolean,
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
              properties: { bearing: headingDeg },
            },
          ]
        : [],
  }
}

export const PhoneHeadingMapLayer = memo(function PhoneHeadingMapLayer({
  active,
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
      shape: JSON.stringify(phoneHeadingShape(coordinate, headingDegRef.current, approximateFix)),
    })
  }, [approximateFix, coordinate, followCamera])

  useEffect(() => {
    if (!active) {
      headingDegRef.current = null
      onHeadingChange(null)
      onStatusChange('idle')
      sourceRef.current?.setNativeProps({
        id: 'center-phone-heading-source',
        shape: JSON.stringify(phoneHeadingShape(null, null, false)),
      })
      return
    }

    let disposed = false
    let remove: (() => void) | null = null

    void startPhoneHeadingUpdates(deviceMotionPhoneHeadingAdapter, (rawHeadingDeg) => {
      if (disposed) return
      const headingDeg = deadBandPhoneHeading(headingDegRef.current, rawHeadingDeg)
      if (headingDeg === headingDegRef.current) return

      headingDegRef.current = headingDeg
      onHeadingChange(headingDeg)
      sourceRef.current?.setNativeProps({
        id: 'center-phone-heading-source',
        shape: JSON.stringify(
          phoneHeadingShape(coordinateRef.current, headingDeg, approximateFixRef.current),
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
  }, [active, cameraRef, currentCameraRef, onHeadingChange, onStatusChange])

  return (
    <>
      <Images images={{ [GPS_HEADING_ICON_ID]: { image: GPS_HEADING_ICON, sdf: true } }} />
      <ShapeSource
        ref={sourceRef}
        id="center-phone-heading-source"
        shape={phoneHeadingShape(coordinate, headingDegRef.current, approximateFix)}
      >
        <SymbolLayer
          id="center-phone-heading-outline"
          style={{
            iconImage: GPS_HEADING_ICON_ID,
            iconRotate: ['get', 'bearing'],
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
            iconRotationAlignment: 'map',
            iconSize: 0.95,
            iconOffset: [0, -10],
            iconColor: theme.palette.mono.white,
          }}
        />
      </ShapeSource>
    </>
  )
})
