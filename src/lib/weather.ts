import { theme } from '@/constants/theme'

export type WeatherIconName =
  | 'sun'
  | 'moon'
  | 'cloud-sun'
  | 'cloud-moon'
  | 'cloud'
  | 'cloud-fog'
  | 'cloud-rain'
  | 'cloud-snow'
  | 'cloud-lightning'

function isNightHour(hour: number): boolean {
  return hour >= 21 || hour < 6
}

export function weatherCodeToIconName(code: number, hour?: number): WeatherIconName {
  const night = hour != null && isNightHour(hour)
  if (code === 0) return night ? 'moon' : 'sun'
  if (code <= 2) return night ? 'cloud-moon' : 'cloud-sun'
  if (code === 3) return 'cloud'
  if (code === 45 || code === 48) return 'cloud-fog'
  if (code >= 51 && code <= 57) return 'cloud-rain'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'cloud-rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'cloud-snow'
  if ([95, 96, 99].includes(code)) return 'cloud-lightning'
  return 'cloud'
}

export function weatherCodeToColor(code: number, hour?: number): string {
  const night = hour != null && isNightHour(hour)
  if (code === 0) return night ? theme.weather.moon : theme.weather.sun
  if (code <= 2) return night ? theme.weather.moonPartly : theme.weather.partly
  if (code === 3) return theme.weather.cloud
  if (code === 45 || code === 48) return theme.weather.fog
  if (code >= 51 && code <= 57) return theme.weather.rain
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return theme.weather.rain
  if ([71, 73, 75, 77, 85, 86].includes(code)) return theme.weather.snow
  if ([95, 96, 99].includes(code)) return theme.weather.thunder
  return theme.weather.cloud
}

export function weatherCodeToLabel(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow'
  if ([95, 96, 99].includes(code)) return 'Thunderstorm'
  return 'Cloudy'
}

export function parseHourLabel(isoTime: string): string {
  const date = new Date(isoTime)
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function isFutureHour(isoTime: string): boolean {
  return new Date(isoTime).getTime() > Date.now()
}
