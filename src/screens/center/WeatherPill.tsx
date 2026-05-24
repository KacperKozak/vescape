import { DropIcon } from 'phosphor-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { interaction, theme } from '@/constants/theme'
import { useMapWeather } from '@/screens/center/useMapWeather'
import { useWeatherStore, weatherCodeToColor } from '@/store/weatherStore'

interface WeatherPillProps {
  location: { latitude: number; longitude: number } | null
  expanded?: boolean
  onPress: () => void
}

function weatherCodeToLabel(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow'
  if ([95, 96, 99].includes(code)) return 'Thunderstorm'
  return 'Cloudy'
}

export function WeatherPill({ location, expanded, onPress }: WeatherPillProps) {
  const weather = useMapWeather(location)
  const weatherCode = useWeatherStore((s) => s.weatherCode)
  const precipitationProbability = useWeatherStore((s) => s.precipitationProbability)

  if (!weather) return null

  const WeatherIcon = weather.icon
  const iconColor = weatherCode != null ? weatherCodeToColor(weatherCode) : theme.bran.text

  if (expanded) {
    return (
      <View style={styles.expanded}>
        <WeatherIcon size={28} color={iconColor} weight="duotone" />
        <View style={styles.expandedText}>
          <Text style={styles.expandedTemp}>{weather.temperature}°</Text>
          {weatherCode != null && (
            <Text style={styles.expandedLabel}>{weatherCodeToLabel(weatherCode)}</Text>
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
      <WeatherIcon size={16} color={iconColor} weight="duotone" />
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
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
  },
  temp: {
    color: '#f1f5f9',
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
    color: '#f1f5f9',
    fontSize: 22,
    fontWeight: '700',
  },
  expandedLabel: {
    color: '#94a3b8',
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
