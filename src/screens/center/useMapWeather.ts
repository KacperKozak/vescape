import { useEffect } from 'react'
import type { Icon } from 'phosphor-react-native'

import { useWeatherStore } from '@/store/weatherStore'

interface WeatherData {
  temperature: number
  icon: Icon
}

export function useMapWeather(
  location: { latitude: number; longitude: number } | null,
): WeatherData | null {
  const temperature = useWeatherStore((s) => s.temperature)
  const icon = useWeatherStore((s) => s.icon)
  const fetchWeather = useWeatherStore((s) => s.fetch)

  useEffect(() => {
    if (!location) return
    void fetchWeather(location.latitude, location.longitude)
  }, [location?.latitude, location?.longitude, fetchWeather])

  if (temperature == null || icon == null) return null
  return { temperature, icon }
}
