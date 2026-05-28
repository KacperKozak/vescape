import { create } from 'zustand'

import { parseHourLabel, isFutureHour } from '@/lib/weather'

const CACHE_MS = 10 * 60 * 1_000
const MIN_DELTA_DEG = 0.01
const FORECAST_HOURS = 12

export interface HourForecast {
  hour: string
  hourNum: number
  temperature: number
  weatherCode: number
  precipitationProbability: number
}

interface WeatherState {
  temperature: number | null
  weatherCode: number | null
  precipitationProbability: number | null
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
        const h = new Date(times[i]).getHours()
        hourly.push({
          hour: parseHourLabel(times[i]),
          hourNum: h,
          temperature: Math.round(temps[i]),
          weatherCode: codes[i],
          precipitationProbability: precips[i] ?? 0,
        })
      }

      set({
        temperature: Math.round(current.temperature_2m),
        weatherCode: current.weather_code,
        precipitationProbability: current.precipitation_probability ?? 0,
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
