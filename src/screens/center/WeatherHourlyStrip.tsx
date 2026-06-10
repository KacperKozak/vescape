import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { WeatherIcon } from '@/components/ui/weather/WeatherIcon'
import { theme } from '@/constants/theme'
import { isNightAtTime, weatherCodeToColor } from '@/lib/weather'
import { useWeatherStore, type HourForecast } from '@/store/weatherStore'

interface HourItemProps {
  item: HourForecast
  sunrise: string | null
  sunset: string | null
}

function HourItem({ item, sunrise, sunset }: HourItemProps) {
  const isNight = isNightAtTime(item.hourNum, item.minuteNum, sunrise, sunset)
  return (
    <View style={styles.item}>
      <Text style={styles.hour}>{item.hour}</Text>
      <WeatherIcon
        code={item.weatherCode}
        hour={item.hourNum}
        isNight={isNight}
        size={20}
        color={weatherCodeToColor(item.weatherCode, item.hourNum, isNight)}
        weight="duotone"
      />
      <Text style={styles.temp}>{item.temperature}°</Text>
      {item.precipitationProbability > 0 && (
        <Text style={styles.precip}>{item.precipitationProbability}%</Text>
      )}
    </View>
  )
}

export function WeatherHourlyStrip() {
  const hourly = useWeatherStore((s) => s.hourly)
  const sunrise = useWeatherStore((s) => s.sunrise)
  const sunset = useWeatherStore((s) => s.sunset)

  if (hourly.length === 0) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      style={styles.container}
    >
      {hourly.map((item) => (
        <HourItem key={item.hour} item={item} sunrise={sunrise} sunset={sunset} />
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
  },
  scroll: {
    paddingHorizontal: 16,
    gap: 4,
  },
  item: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  hour: {
    color: theme.neutral.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  temp: {
    color: theme.neutral.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  precip: {
    color: theme.wheel.color,
    fontSize: 10,
    fontWeight: '600',
  },
})
