import { CloudSunIcon, MapTrifoldIcon, SpeedometerIcon, type Icon } from 'phosphor-react-native'
import { StyleSheet, View } from 'react-native'

import { Text } from '@/components/base/Text'
import { PillSelector, PillSelectorItem } from '@/components/controls/PillSelector'
import { theme } from '@/constants/theme'
import { WeatherIcon } from '@/modules/weather/components/WeatherIcon'
import { useMapWeather } from '@/modules/weather/hooks/useMapWeather'
import { isNightAtTime, weatherCodeToColor } from '@/modules/weather/lib/weather'
import { useWeatherStore } from '@/modules/weather/store/weatherStore'
import type { MainViewState } from '@/screens/main/mainViewState'

interface MapModeTabsProps {
  mode: MainViewState
  top: number
  weatherLocation: { latitude: number; longitude: number } | null
  onEnterMap: () => void
  onEnterWeather: () => void
  onEnterLegalLimits: () => void
}

/** The three map modes the rider switches between: Explore, Weather and Legal limits. */
export function MapModeTabs({
  mode,
  top,
  weatherLocation,
  onEnterMap,
  onEnterWeather,
  onEnterLegalLimits,
}: MapModeTabsProps) {
  const weather = useMapWeather(weatherLocation)
  const sunrise = useWeatherStore((s) => s.sunrise)
  const sunset = useWeatherStore((s) => s.sunset)
  const now = new Date()
  const hour = now.getHours()
  const isNight = isNightAtTime(hour, now.getMinutes(), sunrise, sunset)
  const weatherColor = weather
    ? weatherCodeToColor(weather.weatherCode, hour, isNight)
    : theme.palette.sky.color
  const weatherSelection = {
    bg: theme.alpha(weatherColor, 0.12),
    border: theme.alpha(weatherColor, 0.4),
    color: weatherColor,
  }
  const activeId = mode === 'legalLimits' ? 'legalLimits' : mode === 'weather' ? 'weather' : 'map'

  const WeatherModeIcon: Icon = ({ color, size, weight }) => {
    const iconSize = typeof size === 'number' ? size : 18
    return weather ? (
      <WeatherIcon
        code={weather.weatherCode}
        hour={hour}
        isNight={isNight}
        size={iconSize}
        color={weatherColor}
        weight={weight}
      />
    ) : (
      <CloudSunIcon size={size} color={color} weight={weight} />
    )
  }

  return (
    <View pointerEvents="box-none" style={[styles.mapModeTabs, { top }]}>
      <PillSelector
        activeId={activeId}
        contained
        fitContent
        style={styles.mapModePills}
        contentContainerStyle={styles.mapModePillsContent}
      >
        <PillSelectorItem
          id="map"
          label="Explore"
          icon={MapTrifoldIcon}
          activeLabelOnly
          color={theme.palette.violet}
          activeWidth={116}
          onPress={() => {
            if (mode !== 'map') onEnterMap()
          }}
        />
        <PillSelectorItem
          id="weather"
          label="Weather"
          icon={WeatherModeIcon}
          activeLabelOnly
          color={weatherSelection}
          activeWidth={142}
          inactiveWidth={58}
          hint={
            weather ? (
              <Text style={[styles.mapModeBadgeText, { color: weatherColor }]}>
                {weather.temperature}°
              </Text>
            ) : null
          }
          hintVisibility="inactive"
          hintGap={2}
          onPress={onEnterWeather}
        />
        <PillSelectorItem
          id="legalLimits"
          label="Legal limits"
          icon={SpeedometerIcon}
          activeLabelOnly
          color={theme.palette.green}
          activeWidth={136}
          inactiveWidth={44}
          onPress={onEnterLegalLimits}
        />
      </PillSelector>
    </View>
  )
}

const styles = StyleSheet.create({
  mapModeTabs: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 43,
  },
  mapModePills: {
    alignSelf: 'center',
  },
  mapModePillsContent: {
    justifyContent: 'center',
  },
  mapModeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
})
