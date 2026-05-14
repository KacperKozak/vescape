import { StyleSheet, View } from 'react-native'
import Svg, { Defs, Rect, RadialGradient, LinearGradient, Stop } from 'react-native-svg'

interface MapVignetteProps {
  visible: boolean
}

export function MapVignette({ visible }: MapVignetteProps) {
  if (!visible) return null

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="map-vignette" cx="50%" cy="50%" rx="72%" ry="66%">
            <Stop offset="0%" stopColor="#0f172a" stopOpacity="0" />
            <Stop offset="46%" stopColor="#0f172a" stopOpacity="0.16" />
            <Stop offset="74%" stopColor="#0f172a" stopOpacity="0.58" />
            <Stop offset="100%" stopColor="#0f172a" stopOpacity="0.9" />
          </RadialGradient>
          <LinearGradient id="map-vignette-top" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#0f172a" stopOpacity="0.88" />
            <Stop offset="45%" stopColor="#0f172a" stopOpacity="0.42" />
            <Stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#map-vignette)" />
        <Rect x="0" y="0" width="100%" height="34%" fill="url(#map-vignette-top)" />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },
})
