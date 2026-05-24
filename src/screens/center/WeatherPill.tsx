import { Pressable, StyleSheet, Text } from 'react-native'

import { interaction, theme } from '@/constants/theme'
import { useMapWeather } from '@/screens/center/useMapWeather'

interface WeatherPillProps {
  location: { latitude: number; longitude: number } | null
  onPress: () => void
}

export function WeatherPill({ location, onPress }: WeatherPillProps) {
  const weather = useMapWeather(location)
  if (!weather) return null

  const WeatherIcon = weather.icon
  return (
    <Pressable style={styles.pill} onPress={onPress} android_ripple={interaction.rippleBorderless}>
      <WeatherIcon size={16} color={theme.bran.text} weight="duotone" />
      <Text style={styles.temp}>{weather.temperature}°</Text>
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
})
