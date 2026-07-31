import { ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '@/components/base/Text'

import { WeatherIcon } from '@/modules/weather/components/WeatherIcon'
import { theme } from '@/constants/theme'
import {
  isNightAtTime,
  weatherCodeToColor,
  type WeatherHourForecast,
} from '@/modules/weather/lib/weather'

interface HourItemProps {
  item: WeatherHourForecast
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

interface WeatherHourlyStripProps {
  hours: WeatherHourForecast[]
  sunrise: string | null
  sunset: string | null
}

/** Horizontal scroll of hourly forecast items. */
export function WeatherHourlyStrip({ hours, sunrise, sunset }: WeatherHourlyStripProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      style={styles.container}
    >
      {hours.map((item) => (
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
    color: theme.palette.sky.color,
    fontSize: 10,
    fontWeight: '600',
  },
})
