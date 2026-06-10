import { theme } from '@/constants/theme'

export interface OpenMeteoHourInput {
  times: string[]
  temperatures: number[]
  weatherCodes: number[]
  precipitationProbabilities: (number | null)[]
}

export interface WeatherHourForecast {
  hour: string
  hourNum: number
  minuteNum: number
  temperature: number
  weatherCode: number
  precipitationProbability: number
}

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

export function weatherCodeToIconName(
  code: number,
  hour?: number,
  nightOverride?: boolean,
): WeatherIconName {
  const night = nightOverride ?? (hour != null && isNightHour(hour))
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

export function weatherCodeToColor(code: number, hour?: number, nightOverride?: boolean): string {
  const night = nightOverride ?? (hour != null && isNightHour(hour))
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
  const [, time = ''] = isoTime.split('T')
  const [hour = '0', minute = '00'] = time.split(':')
  return `${Number(hour)}:${minute.padStart(2, '0')}`
}

function parseHourNumber(isoTime: string): number {
  const [, time = ''] = isoTime.split('T')
  const [hour = '0'] = time.split(':')
  return Number(hour)
}

function parseMinuteNumber(isoTime: string): number {
  const [, time = ''] = isoTime.split('T')
  const [, minute = '0'] = time.split(':')
  return Number(minute)
}

function minutesOfDay(isoTime: string): number {
  return parseHourNumber(isoTime) * 60 + parseMinuteNumber(isoTime)
}

export function isNightAtTime(
  hour: number,
  minute: number,
  sunrise: string | null,
  sunset: string | null,
): boolean {
  if (!sunrise || !sunset) return isNightHour(hour)
  const timeMinutes = hour * 60 + minute
  return timeMinutes < minutesOfDay(sunrise) || timeMinutes >= minutesOfDay(sunset)
}

export function buildOpenMeteoHourlyForecast({
  times,
  temperatures,
  weatherCodes,
  precipitationProbabilities,
}: OpenMeteoHourInput): WeatherHourForecast[] {
  return times.map((time, index) => ({
    hour: parseHourLabel(time),
    hourNum: parseHourNumber(time),
    minuteNum: parseMinuteNumber(time),
    temperature: Math.round(temperatures[index]),
    weatherCode: weatherCodes[index],
    precipitationProbability: precipitationProbabilities[index] ?? 0,
  }))
}
