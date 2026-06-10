import { create } from 'zustand'

import { buildOpenMeteoHourlyForecast, type WeatherHourForecast } from '@/lib/weather'

const CACHE_MS = 10 * 60 * 1_000
const MIN_DELTA_DEG = 0.01
const FORECAST_HOURS = 12

function getDeviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export type HourForecast = WeatherHourForecast

interface WeatherState {
  temperature: number | null
  weatherCode: number | null
  precipitationProbability: number | null
  sunrise: string | null
  sunset: string | null
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

export const useWeatherStore = create<WeatherState & WeatherActions>((set, get) => ({
  temperature: null,
  weatherCode: null,
  precipitationProbability: null,
  sunrise: null,
  sunset: null,
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
      const timezone = encodeURIComponent(getDeviceTimeZone())
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,precipitation_probability&hourly=temperature_2m,weather_code,precipitation_probability&daily=sunrise,sunset&forecast_hours=${FORECAST_HOURS}&forecast_days=1&timezone=${timezone}`
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
      const sunrise: string | null = json.daily?.sunrise?.[0] ?? null
      const sunset: string | null = json.daily?.sunset?.[0] ?? null

      const hourly = buildOpenMeteoHourlyForecast({
        times,
        temperatures: temps,
        weatherCodes: codes,
        precipitationProbabilities: precips,
      })

      set({
        temperature: Math.round(current.temperature_2m),
        weatherCode: current.weather_code,
        precipitationProbability: current.precipitation_probability ?? 0,
        sunrise,
        sunset,
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
