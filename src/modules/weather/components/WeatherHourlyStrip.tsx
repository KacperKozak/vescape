import { WeatherHourlyStrip as WeatherHourlyStripView } from '@/modules/weather/components/WeatherHourlyStripView'
import { useWeatherStore } from '@/modules/weather/store/weatherStore'

/** Store-bound container for the hourly forecast strip. */
export function WeatherHourlyStrip() {
  const hourly = useWeatherStore((s) => s.hourly)
  const sunrise = useWeatherStore((s) => s.sunrise)
  const sunset = useWeatherStore((s) => s.sunset)

  if (hourly.length === 0) return null

  return <WeatherHourlyStripView hours={hourly} sunrise={sunrise} sunset={sunset} />
}
