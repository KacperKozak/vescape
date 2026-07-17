import { useEffect, type ReactNode } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'

import { theme } from '@/constants/theme'
import {
  Canvas,
  Group,
  LinearGradient,
  RadialGradient,
  Rect,
  vec,
} from '@shopify/react-native-skia'
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import type { CenterViewState } from '@/screens/center/centerViewState'

interface MapVignetteProps {
  mode: CenterViewState
  panelHeight?: number
  /** Kept for call-site compatibility; Skia gradients have no global IDs. */
  idPrefix?: string
  topOnly?: boolean
  visible?: boolean
  fadeOutProgress?: SharedValue<number>
}

interface VignetteLayerProps {
  width: number
  height: number
  opacity: { value: number }
  radial?: number[]
  top: number[]
  topPositions: number[]
  topEnd: number
  bottom?: number[]
  bottomPositions?: number[]
  bottomStart?: number
  children?: ReactNode
}

const DARK = theme.palette.slate.surfaceDeep
const RADIAL_POSITIONS = [0, 0.4, 0.68, 1]
const TOP_POSITIONS = [0, 0.7, 1]
const HISTORY_TOP_POSITIONS = [0, 0.52, 1]
const HISTORY_BOTTOM_POSITIONS = [0, 0.5, 0.6, 1]
const WEATHER_TOP_POSITIONS = [0, 0.42, 0.78, 1]
const WEATHER_BOTTOM_POSITIONS = [0, 0.55, 1]

function vignetteOpacity(level: number) {
  return theme.alpha(DARK, level as 0 | 0.12 | 0.3 | 0.6 | 0.85)
}

function VignetteLayer({
  width,
  height,
  opacity,
  radial,
  top,
  topPositions,
  topEnd,
  bottom,
  bottomPositions,
  bottomStart,
  children,
}: VignetteLayerProps) {
  const radialRadius = width * 0.68
  const radialScaleY = (height * 0.62) / radialRadius
  const radialBaseHeight = height / radialScaleY
  const radialBaseTop = (height - radialBaseHeight) / 2

  return (
    <Group opacity={opacity}>
      {radial != null ? (
        <Group origin={vec(width / 2, height / 2)} transform={[{ scaleY: radialScaleY }]}>
          <Rect x={0} y={radialBaseTop} width={width} height={radialBaseHeight}>
            <RadialGradient
              c={vec(width / 2, height / 2)}
              r={radialRadius}
              colors={radial.map(vignetteOpacity)}
              positions={RADIAL_POSITIONS}
            />
          </Rect>
        </Group>
      ) : null}
      <Rect x={0} y={0} width={width} height={height * topEnd}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, height * topEnd)}
          colors={top.map(vignetteOpacity)}
          positions={topPositions}
        />
      </Rect>
      {bottom != null && bottomStart != null ? (
        <Rect x={0} y={height * bottomStart} width={width} height={height * (1 - bottomStart)}>
          <LinearGradient
            start={vec(0, height)}
            end={vec(0, height * bottomStart)}
            colors={bottom.map(vignetteOpacity)}
            positions={bottomPositions}
          />
        </Rect>
      ) : null}
      {children}
    </Group>
  )
}

function AnimatedHistoryBottomGradient({
  width,
  height,
  bottomStart,
}: {
  width: number
  height: number
  bottomStart: SharedValue<number>
}) {
  const y = useDerivedValue(() => height * bottomStart.value)
  const gradientEnd = useDerivedValue(() => vec(0, height * bottomStart.value))
  const gradientHeight = useDerivedValue(() => height * (1 - bottomStart.value))

  return (
    <Rect x={0} y={y} width={width} height={gradientHeight}>
      <LinearGradient
        start={vec(0, height)}
        end={gradientEnd}
        colors={[0.85, 0.6, 0.3, 0].map(vignetteOpacity)}
        positions={HISTORY_BOTTOM_POSITIONS}
      />
    </Rect>
  )
}

export function MapVignette({
  mode,
  panelHeight = 0,
  topOnly = false,
  visible = true,
  fadeOutProgress,
}: MapVignetteProps) {
  const { width, height } = useWindowDimensions()
  const standardOpacity = useSharedValue(
    visible && mode !== 'history' && mode !== 'weather' ? 1 : 0,
  )
  const historyOpacity = useSharedValue(visible && mode === 'history' ? 1 : 0)
  const weatherOpacity = useSharedValue(visible && mode === 'weather' ? 1 : 0)
  const panelTop = panelHeight > 0 ? Math.max(0.2, 1 - panelHeight / height) : 0.55
  const historyBottomStart = Math.max(0.05, panelTop - 0.28)
  const historyBottomStartValue = useSharedValue(historyBottomStart)
  const standardLayerOpacity = useDerivedValue(
    () => standardOpacity.value * (1 - (fadeOutProgress?.value ?? 0)),
  )
  const historyLayerOpacity = useDerivedValue(
    () => historyOpacity.value * (1 - (fadeOutProgress?.value ?? 0)),
  )
  const weatherLayerOpacity = useDerivedValue(
    () => weatherOpacity.value * (1 - (fadeOutProgress?.value ?? 0)),
  )

  useEffect(() => {
    const transition = { duration: 280, easing: Easing.out(Easing.cubic) }
    standardOpacity.value = withTiming(
      visible && mode !== 'history' && mode !== 'weather' ? 1 : 0,
      transition,
    )
    historyOpacity.value = withTiming(visible && mode === 'history' ? 1 : 0, transition)
    weatherOpacity.value = withTiming(visible && mode === 'weather' ? 1 : 0, transition)
  }, [historyOpacity, mode, standardOpacity, visible, weatherOpacity])

  useEffect(() => {
    historyBottomStartValue.value = withTiming(historyBottomStart, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    })
  }, [historyBottomStart, historyBottomStartValue])

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Canvas style={styles.canvas}>
        <VignetteLayer
          width={width}
          height={height}
          opacity={standardLayerOpacity}
          radial={topOnly ? undefined : [0, 0.12, 0.3, 0.6]}
          top={[0.85, 0.3, 0]}
          topPositions={TOP_POSITIONS}
          topEnd={0.34}
          bottom={topOnly ? undefined : [0.85, 0.6, 0]}
          bottomPositions={TOP_POSITIONS}
          bottomStart={topOnly ? undefined : 0.6}
        />
        {!topOnly ? (
          <>
            <VignetteLayer
              width={width}
              height={height}
              opacity={historyLayerOpacity}
              radial={[0, 0.12, 0.3, 0.6]}
              top={[0.85, 0.6, 0]}
              topPositions={HISTORY_TOP_POSITIONS}
              topEnd={0.38}
            >
              <AnimatedHistoryBottomGradient
                width={width}
                height={height}
                bottomStart={historyBottomStartValue}
              />
            </VignetteLayer>
            <VignetteLayer
              width={width}
              height={height}
              opacity={weatherLayerOpacity}
              radial={[0, 0.12, 0.3, 0.6]}
              top={[0.85, 0.6, 0.3, 0]}
              topPositions={WEATHER_TOP_POSITIONS}
              topEnd={0.46}
              bottom={[0.85, 0.6, 0]}
              bottomPositions={WEATHER_BOTTOM_POSITIONS}
              bottomStart={0.78}
            />
          </>
        ) : null}
      </Canvas>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    zIndex: 4,
  },
  canvas: StyleSheet.absoluteFill,
})
