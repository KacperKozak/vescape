import { useCallback, useState } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { Canvas, LinearGradient, Rect, RoundedRect, vec } from '@shopify/react-native-skia'

import { theme } from '@/constants/theme'

interface TuneTileFillProps {
  fraction: number | null
  color?: string
  fillHeightRatio?: number
}

const LINE_THICKNESS = 2
const MARKER_WIDTH = 3

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function TuneTileFill({
  fraction,
  color = theme.palette.sky.color,
  fillHeightRatio = 0.5,
}: TuneTileFillProps) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
  }, [])

  const normalized = fraction == null ? 0 : clamp01(fraction)
  const fillHeight = size.height * clamp01(fillHeightRatio)
  const fillY = size.height - fillHeight
  const fillWidth = size.width * normalized
  const lineY = Math.max(0, size.height - LINE_THICKNESS)
  const markerHeight = fillHeight

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {size.width > 0 && size.height > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          {fillWidth > 0 ? (
            <Rect x={0} y={fillY} width={fillWidth} height={fillHeight}>
              <LinearGradient
                start={vec(0, fillY)}
                end={vec(0, size.height)}
                colors={[
                  theme.alpha(color, 0),
                  theme.alpha(color, 0.12),
                  theme.alpha(color, 0.12),
                  theme.alpha(color, 0.3),
                ]}
                positions={[0, 0.35, 0.75, 1]}
              />
            </Rect>
          ) : null}
          <RoundedRect
            x={0}
            y={lineY}
            width={size.width}
            height={LINE_THICKNESS}
            r={LINE_THICKNESS / 2}
            color={theme.palette.slate.border}
          />
          {fillWidth > 0 ? (
            <RoundedRect
              x={0}
              y={lineY}
              width={fillWidth}
              height={LINE_THICKNESS}
              r={LINE_THICKNESS / 2}
              color={color}
            />
          ) : null}
          {normalized > 0 && normalized < 1 ? (
            <Rect
              x={fillWidth - MARKER_WIDTH / 2}
              y={lineY - markerHeight}
              width={MARKER_WIDTH}
              height={markerHeight + LINE_THICKNESS}
              color={color}
            />
          ) : null}
        </Canvas>
      ) : null}
    </View>
  )
}
