import { ArrowLeftIcon, ArrowsClockwiseIcon } from 'phosphor-react-native'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton } from '@/components/base/IconButton'
import { theme } from '@/constants/theme'
import { WeatherHourlyStrip } from '@/modules/weather/components/WeatherHourlyStrip'
import { WeatherPill } from '@/modules/weather/components/WeatherPill'
import { WeatherRadarTimeline } from '@/modules/weather/components/WeatherRadarTimeline'
import { useRainViewerRadarStore } from '@/modules/weather/store/rainViewerRadarStore'
import { useWeatherStore } from '@/modules/weather/store/weatherStore'

interface WeatherMapOverlayProps {
  visible: boolean
  /** Top of the map's control row, so the back and refresh buttons line up with the mode tabs. */
  top: number
  /** Just below the mode tabs, where the expanded forecast pill sits. */
  pillTop: number
  location: { latitude: number; longitude: number } | null
  onExit: () => void
  onRefreshForecast: () => void
}

/** Everything the map shows in weather mode: forecast pill, radar timeline and the hourly strip. */
export function WeatherMapOverlay({
  visible,
  top,
  pillTop,
  location,
  onExit,
  onRefreshForecast,
}: WeatherMapOverlayProps) {
  const insets = useSafeAreaInsets()
  const forecastLoading = useWeatherStore((s) => s.loading)
  const radarLoading = useRainViewerRadarStore((s) => s.loading)
  const refreshRadar = useRainViewerRadarStore((s) => s.fetch)

  return (
    <View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[styles.weatherInterface, visible ? styles.visible : styles.hidden]}
    >
      <IconButton
        icon={ArrowLeftIcon}
        size="sm"
        accessibilityLabel="Back from weather"
        onPress={onExit}
        style={[styles.mapTopBackButton, { top }]}
      />
      <IconButton
        icon={ArrowsClockwiseIcon}
        onPress={() => {
          onRefreshForecast()
          refreshRadar(true)
        }}
        loading={forecastLoading || radarLoading}
        style={[styles.weatherRefreshButton, { top }]}
      />
      <View pointerEvents="none" style={[styles.weatherExpandedPill, { top: pillTop }]}>
        <WeatherPill location={location} expanded onPress={() => undefined} />
      </View>
      <View
        style={[
          styles.weatherRadarTimelineContainer,
          { bottom: Math.max(insets.bottom, 16) + 112 },
        ]}
      >
        {visible ? <WeatherRadarTimeline /> : null}
      </View>
      <View style={[styles.weatherHourlyContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <WeatherHourlyStrip />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  weatherInterface: {
    ...StyleSheet.absoluteFill,
    zIndex: 8,
  },
  visible: {
    opacity: 1,
  },
  hidden: {
    opacity: 0,
  },
  mapTopBackButton: {
    position: 'absolute',
    left: 12,
    zIndex: 32,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
  },
  weatherRefreshButton: {
    position: 'absolute',
    right: 10,
    zIndex: 30,
  },
  weatherExpandedPill: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 29,
  },
  weatherRadarTimelineContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 31,
  },
  weatherHourlyContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
})
