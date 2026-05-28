import { useEffect } from 'react'

import { useWeatherStore } from '@/store/weatherStore'

interface WeatherData {
  temperature: number
  weatherCode: number
}

export function useMapWeather(
  location: { latitude: number; longitude: number } | null,
): WeatherData | null {
  const temperature = useWeatherStore((s) => s.temperature)
  const weatherCode = useWeatherStore((s) => s.weatherCode)
  const fetchWeather = useWeatherStore((s) => s.fetch)

  useEffect(() => {
    if (!location) return
    void fetchWeather(location.latitude, location.longitude)
  }, [location?.latitude, location?.longitude, fetchWeather])

  if (temperature == null || weatherCode == null) return null
  return { temperature, weatherCode }
}
