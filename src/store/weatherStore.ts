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
import { create } from 'zustand'

import { theme } from '@/constants/theme'

const CACHE_MS = 10 * 60 * 1_000
const MIN_DELTA_DEG = 0.01
const FORECAST_HOURS = 12

export interface HourForecast {
  hour: string
  temperature: number
  weatherCode: number
  precipitationProbability: number
  icon: Icon
}

interface WeatherState {
  temperature: number | null
  weatherCode: number | null
  precipitationProbability: number | null
  icon: Icon | null
  hourly: HourForecast[]
  loading: boolean
  lastLat: number | null
  lastLon: number | null
  fetchedAt: number | null
}

interface WeatherActions {
  fetch: (lat: number, lon: number) => Promise<void>
  refresh: () => Promise<void>
}

function weatherCodeToIcon(code: number): Icon {
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

export function weatherCodeToColor(code: number): string {
  if (code === 0) return theme.weather.sun
  if (code <= 2) return theme.weather.partly
  if (code === 3) return theme.weather.cloud
  if (code === 45 || code === 48) return theme.weather.fog
  if (code >= 51 && code <= 57) return theme.weather.rain
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return theme.weather.rain
  if ([71, 73, 75, 77, 85, 86].includes(code)) return theme.weather.snow
  if ([95, 96, 99].includes(code)) return theme.weather.thunder
  return theme.weather.cloud
}

function parseHourLabel(isoTime: string): string {
  const date = new Date(isoTime)
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
}

function isFutureHour(isoTime: string): boolean {
  return new Date(isoTime).getTime() > Date.now()
}

export const useWeatherStore = create<WeatherState & WeatherActions>((set, get) => ({
  temperature: null,
  weatherCode: null,
  precipitationProbability: null,
  icon: null,
  hourly: [],
  loading: false,
  lastLat: null,
  lastLon: null,
  fetchedAt: null,

  async fetch(lat: number, lon: number) {
    const state = get()
    if (
      state.fetchedAt &&
      Date.now() - state.fetchedAt < CACHE_MS &&
      state.lastLat != null &&
      state.lastLon != null &&
      Math.abs(state.lastLat - lat) < MIN_DELTA_DEG &&
      Math.abs(state.lastLon - lon) < MIN_DELTA_DEG
    ) {
      return
    }

    if (state.loading) return
    set({ loading: true })

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,precipitation_probability&hourly=temperature_2m,weather_code,precipitation_probability&forecast_hours=${FORECAST_HOURS}&timezone=auto`
      const res = await globalThis.fetch(url)
      if (!res.ok) return
      const json = await res.json()

      const current = json.current as {
        temperature_2m: number
        weather_code: number
        precipitation_probability: number | null
      }

      const times: string[] = json.hourly?.time ?? []
      const temps: number[] = json.hourly?.temperature_2m ?? []
      const codes: number[] = json.hourly?.weather_code ?? []
      const precips: (number | null)[] = json.hourly?.precipitation_probability ?? []

      const hourly: HourForecast[] = []
      for (let i = 0; i < times.length; i++) {
        if (!isFutureHour(times[i])) continue
        hourly.push({
          hour: parseHourLabel(times[i]),
          temperature: Math.round(temps[i]),
          weatherCode: codes[i],
          precipitationProbability: precips[i] ?? 0,
          icon: weatherCodeToIcon(codes[i]),
        })
      }

      set({
        temperature: Math.round(current.temperature_2m),
        weatherCode: current.weather_code,
        precipitationProbability: current.precipitation_probability ?? 0,
        icon: weatherCodeToIcon(current.weather_code),
        hourly,
        lastLat: lat,
        lastLon: lon,
        fetchedAt: Date.now(),
      })
    } catch {
      // network error in prototype
    } finally {
      set({ loading: false })
    }
  },

  async refresh() {
    const { lastLat, lastLon } = get()
    if (lastLat == null || lastLon == null) return
    set({ fetchedAt: null })
    await get().fetch(lastLat, lastLon)
  },
}))
