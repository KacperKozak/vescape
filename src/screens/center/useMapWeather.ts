import {
  CloudFogIcon,
  CloudIcon,
  CloudLightningIcon,
  CloudRainIcon,
  CloudSnowIcon,
  CloudSunIcon,
  SunIcon,
  type Icon,
} from 'phosphor-react-native'
import { useEffect, useRef, useState } from 'react'

const CACHE_MS = 10 * 60 * 1000
const MIN_DELTA_DEG = 0.01

interface WeatherData {
  temperature: number
  icon: Icon
}

interface Cache {
  data: WeatherData
  lat: number
  lon: number
  fetchedAt: number
}

let cache: Cache | null = null

function codeToIcon(code: number): Icon {
  if (code === 0) return SunIcon
  if (code <= 2) return CloudSunIcon
  if (code === 3) return CloudIcon
  if (code === 45 || code === 48) return CloudFogIcon
  if (code >= 51 && code <= 57) return CloudRainIcon
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRainIcon
  if ([71, 73, 75, 77, 85, 86].includes(code)) return CloudSnowIcon
  if ([95, 96, 99].includes(code)) return CloudLightningIcon
  return CloudIcon
}

export function useMapWeather(
  location: { latitude: number; longitude: number } | null,
): WeatherData | null {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const fetchingRef = useRef(false)

  const lat = location?.latitude ?? null
  const lon = location?.longitude ?? null

  useEffect(() => {
    if (lat == null || lon == null) return

    const now = Date.now()
    if (
      cache &&
      now - cache.fetchedAt < CACHE_MS &&
      Math.abs(cache.lat - lat) < MIN_DELTA_DEG &&
      Math.abs(cache.lon - lon) < MIN_DELTA_DEG
    ) {
      queueMicrotask(() => setWeather(cache!.data))
      return
    }

    if (fetchingRef.current) return
    fetchingRef.current = true

    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`,
    )
      .then((res) => res.json())
      .then((json: { current: { temperature_2m: number; weather_code: number } }) => {
        const data: WeatherData = {
          temperature: Math.round(json.current.temperature_2m),
          icon: codeToIcon(json.current.weather_code),
        }
        cache = { data, lat, lon, fetchedAt: Date.now() }
        setWeather(data)
      })
      .catch(() => undefined)
      .finally(() => {
        fetchingRef.current = false
      })
  }, [lat, lon])

  return weather
}
