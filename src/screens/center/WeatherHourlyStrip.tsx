import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { theme } from '@/constants/theme'
import { useWeatherStore, weatherCodeToColor, type HourForecast } from '@/store/weatherStore'

function HourItem({ item }: { item: HourForecast }) {
  const Icon = item.icon
  return (
    <View style={styles.item}>
      <Text style={styles.hour}>{item.hour}</Text>
      <Icon size={20} color={weatherCodeToColor(item.weatherCode, item.hourNum)} weight="duotone" />
      <Text style={styles.temp}>{item.temperature}°</Text>
      {item.precipitationProbability > 0 && (
        <Text style={styles.precip}>{item.precipitationProbability}%</Text>
      )}
    </View>
  )
}

export function WeatherHourlyStrip() {
  const hourly = useWeatherStore((s) => s.hourly)

  if (hourly.length === 0) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      style={styles.container}
    >
      {hourly.map((item) => (
        <HourItem key={item.hour} item={item} />
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
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  temp: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '600',
  },
  precip: {
    color: theme.wheel.color,
    fontSize: 10,
    fontWeight: '600',
  },
})
