import { DropIcon } from 'phosphor-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { WeatherIcon } from '@/components/ui/weather/WeatherIcon'
import { interaction, theme } from '@/constants/theme'
import { weatherCodeToColor, weatherCodeToLabel } from '@/lib/weather'
import { useMapWeather } from '@/screens/center/useMapWeather'
import { useWeatherStore } from '@/store/weatherStore'

interface WeatherPillProps {
  location: { latitude: number; longitude: number } | null
  expanded?: boolean
  onPress: () => void
}

export function WeatherPill({ location, expanded, onPress }: WeatherPillProps) {
  const weather = useMapWeather(location)
  const precipitationProbability = useWeatherStore((s) => s.precipitationProbability)

  if (!weather) return null

  const currentHour = new Date().getHours()
  const iconColor =
    weather.weatherCode != null
      ? weatherCodeToColor(weather.weatherCode, currentHour)
      : theme.bran.text

  if (expanded) {
    return (
      <View style={styles.expanded}>
        <WeatherIcon
          code={weather.weatherCode}
          hour={currentHour}
          size={28}
          color={iconColor}
          weight="duotone"
        />
        <View style={styles.expandedText}>
          <Text style={styles.expandedTemp}>{weather.temperature}°</Text>
          {weather.weatherCode != null && (
            <Text style={styles.expandedLabel}>{weatherCodeToLabel(weather.weatherCode)}</Text>
          )}
        </View>
        {precipitationProbability != null && precipitationProbability > 0 && (
          <View style={styles.precipRow}>
            <DropIcon size={14} color={theme.wheel.color} weight="duotone" />
            <Text style={styles.precipText}>{precipitationProbability}%</Text>
          </View>
        )}
      </View>
    )
  }

  return (
    <Pressable style={styles.pill} onPress={onPress} android_ripple={interaction.rippleBorderless}>
      <WeatherIcon
        code={weather.weatherCode}
        hour={currentHour}
        size={16}
        color={iconColor}
        weight="duotone"
      />
      <Text style={styles.temp}>{weather.temperature}°</Text>
      {precipitationProbability != null && precipitationProbability > 0 && (
        <>
          <DropIcon size={12} color={theme.wheel.color} weight="duotone" />
          <Text style={styles.pillPrecip}>{precipitationProbability}%</Text>
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.neutral.mapOverlayPill,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.neutral.borderMuted,
  },
  temp: {
    color: theme.neutral.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  pillPrecip: {
    color: theme.wheel.color,
    fontSize: 11,
    fontWeight: '600',
  },
  expanded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  expandedText: {
    gap: 1,
  },
  expandedTemp: {
    color: theme.neutral.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  expandedLabel: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  precipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 8,
  },
  precipText: {
    color: theme.wheel.color,
    fontSize: 13,
    fontWeight: '600',
  },
})
