import { Dimensions, StyleSheet, View } from 'react-native'
import Svg, { Defs, Rect, RadialGradient, LinearGradient, Stop } from 'react-native-svg'

import type { CenterViewState } from '@/screens/center/centerViewState'

interface MapVignetteProps {
  mode: CenterViewState
  panelHeight?: number
}

export function MapVignette({ mode, panelHeight = 0 }: MapVignetteProps) {
  if (mode === 'history') {
    const screenHeight = Dimensions.get('window').height
    const panelTopPct =
      panelHeight > 0 ? Math.max(20, Math.round((1 - panelHeight / screenHeight) * 100)) : 55
    const rectTopPct = Math.max(5, panelTopPct - 28)
    const bottomY = `${rectTopPct}%`
    const bottomH = `${100 - rectTopPct}%`

    return (
      <View pointerEvents="none" style={styles.wrap}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="map-vignette-h" cx="50%" cy="50%" rx="68%" ry="62%">
              <Stop offset="0%" stopColor="#0f172a" stopOpacity="0" />
              <Stop offset="40%" stopColor="#0f172a" stopOpacity="0.14" />
              <Stop offset="68%" stopColor="#0f172a" stopOpacity="0.4" />
              <Stop offset="100%" stopColor="#0f172a" stopOpacity="0.65" />
            </RadialGradient>
            <LinearGradient id="map-vignette-top-h" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.9" />
              <Stop offset="52%" stopColor="#0f172a" stopOpacity="0.5" />
              <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="map-vignette-bottom-h" x1="0%" y1="100%" x2="0%" y2="0%">
              <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.80" />
              <Stop offset="50%" stopColor="#0f172a" stopOpacity="0.70" />
              <Stop offset="60%" stopColor="#0f172a" stopOpacity="0.20" />
              <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#map-vignette-h)" />
          <Rect x="0" y="0" width="100%" height="38%" fill="url(#map-vignette-top-h)" />
          <Rect
            x="0"
            y={bottomY}
            width="100%"
            height={bottomH}
            fill="url(#map-vignette-bottom-h)"
          />
        </Svg>
      </View>
    )
  }

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="map-vignette" cx="50%" cy="50%" rx="68%" ry="62%">
            <Stop offset="0%" stopColor="#0f172a" stopOpacity="0" />
            <Stop offset="40%" stopColor="#0f172a" stopOpacity="0.1" />
            <Stop offset="68%" stopColor="#0f172a" stopOpacity="0.32" />
            <Stop offset="100%" stopColor="#0f172a" stopOpacity="0.58" />
          </RadialGradient>
          <LinearGradient id="map-vignette-top" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.88" />
            <Stop offset="70%" stopColor="#0f172a" stopOpacity="0.42" />
            <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="map-vignette-bottom" x1="0%" y1="100%" x2="0%" y2="0%">
            <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.9" />
            <Stop offset="10%" stopColor="#0f172a" stopOpacity="0.8" />
            <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#map-vignette)" />
        <Rect x="0" y="0" width="100%" height="34%" fill="url(#map-vignette-top)" />
        <Rect x="0" y="60%" width="100%" height="40%" fill="url(#map-vignette-bottom)" />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    zIndex: 4,
  },
})
