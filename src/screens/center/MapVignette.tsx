import { StyleSheet, useWindowDimensions, View } from 'react-native'
import Svg, { Defs, Rect, RadialGradient, LinearGradient, Stop } from 'react-native-svg'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'

import type { CenterViewState } from '@/screens/center/centerViewState'

interface MapVignetteProps {
  mode: CenterViewState
  panelHeight?: number
  idPrefix?: string
}

export function MapVignette({
  mode,
  panelHeight = 0,
  idPrefix = 'map-vignette',
}: MapVignetteProps) {
  const { height: screenHeight } = useWindowDimensions()
  const radialId = `${idPrefix}-radial`
  const topId = `${idPrefix}-top`
  const bottomId = `${idPrefix}-bottom`
  const historyRadialId = `${idPrefix}-history-radial`
  const historyTopId = `${idPrefix}-history-top`
  const historyBottomId = `${idPrefix}-history-bottom`
  const panelTopPct =
    panelHeight > 0 ? Math.max(20, Math.round((1 - panelHeight / screenHeight) * 100)) : 55
  const rectTopPct = Math.max(5, panelTopPct - 28)
  const bottomY = `${rectTopPct}%`
  const bottomH = `${100 - rectTopPct}%`
  const weatherId = `${idPrefix}-weather-radial`
  const weatherTopId = `${idPrefix}-weather-top`
  const weatherBottomId = `${idPrefix}-weather-bottom`
  const standardStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(mode === 'history' || mode === 'weather' ? 0 : 1, { duration: 180 }),
    }),
    [mode],
  )
  const historyStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(mode === 'history' ? 1 : 0, { duration: 180 }),
    }),
    [mode],
  )
  const weatherStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(mode === 'weather' ? 1 : 0, { duration: 180 }),
    }),
    [mode],
  )

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={[styles.layer, standardStyle]}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id={radialId} cx="50%" cy="50%" rx="68%" ry="62%">
              <Stop offset="0%" stopColor="#0f172a" stopOpacity="0" />
              <Stop offset="40%" stopColor="#0f172a" stopOpacity="0.1" />
              <Stop offset="68%" stopColor="#0f172a" stopOpacity="0.32" />
              <Stop offset="100%" stopColor="#0f172a" stopOpacity="0.58" />
            </RadialGradient>
            <LinearGradient id={topId} x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.88" />
              <Stop offset="70%" stopColor="#0f172a" stopOpacity="0.42" />
              <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id={bottomId} x1="0%" y1="100%" x2="0%" y2="0%">
              <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.9" />
              <Stop offset="10%" stopColor="#0f172a" stopOpacity="0.8" />
              <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${radialId})`} />
          <Rect x="0" y="0" width="100%" height="34%" fill={`url(#${topId})`} />
          <Rect x="0" y="60%" width="100%" height="40%" fill={`url(#${bottomId})`} />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.layer, historyStyle]}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id={historyRadialId} cx="50%" cy="50%" rx="68%" ry="62%">
              <Stop offset="0%" stopColor="#0f172a" stopOpacity="0" />
              <Stop offset="40%" stopColor="#0f172a" stopOpacity="0.14" />
              <Stop offset="68%" stopColor="#0f172a" stopOpacity="0.4" />
              <Stop offset="100%" stopColor="#0f172a" stopOpacity="0.65" />
            </RadialGradient>
            <LinearGradient id={historyTopId} x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.9" />
              <Stop offset="52%" stopColor="#0f172a" stopOpacity="0.5" />
              <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id={historyBottomId} x1="0%" y1="100%" x2="0%" y2="0%">
              <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.80" />
              <Stop offset="50%" stopColor="#0f172a" stopOpacity="0.70" />
              <Stop offset="60%" stopColor="#0f172a" stopOpacity="0.20" />
              <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${historyRadialId})`} />
          <Rect x="0" y="0" width="100%" height="38%" fill={`url(#${historyTopId})`} />
          <Rect x="0" y={bottomY} width="100%" height={bottomH} fill={`url(#${historyBottomId})`} />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.layer, weatherStyle]}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id={weatherId} cx="50%" cy="50%" rx="68%" ry="62%">
              <Stop offset="0%" stopColor="#0f172a" stopOpacity="0" />
              <Stop offset="40%" stopColor="#0f172a" stopOpacity="0.08" />
              <Stop offset="68%" stopColor="#0f172a" stopOpacity="0.28" />
              <Stop offset="100%" stopColor="#0f172a" stopOpacity="0.55" />
            </RadialGradient>
            <LinearGradient id={weatherTopId} x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.92" />
              <Stop offset="55%" stopColor="#0f172a" stopOpacity="0.45" />
              <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id={weatherBottomId} x1="0%" y1="100%" x2="0%" y2="0%">
              <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.88" />
              <Stop offset="55%" stopColor="#0f172a" stopOpacity="0.50" />
              <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${weatherId})`} />
          <Rect x="0" y="0" width="100%" height="30%" fill={`url(#${weatherTopId})`} />
          <Rect x="0" y="78%" width="100%" height="22%" fill={`url(#${weatherBottomId})`} />
        </Svg>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    zIndex: 4,
  },
  layer: {
    ...StyleSheet.absoluteFill,
  },
})
