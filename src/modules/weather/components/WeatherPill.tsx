import { WeatherPill as WeatherPillView } from '@/modules/weather/components/WeatherPillView'
import { isNightAtTime } from '@/modules/weather/lib/weather'
import { useMapWeather } from '@/screens/main/map/useMapWeather'
import { useWeatherStore } from '@/modules/weather/store/weatherStore'

interface WeatherPillProps {
  location: { latitude: number; longitude: number } | null
  expanded?: boolean
  onPress: () => void
}

/** Store-bound container for the map weather pill. */
export function WeatherPill({ location, expanded, onPress }: WeatherPillProps) {
  const weather = useMapWeather(location)
  const precipitationProbability = useWeatherStore((s) => s.precipitationProbability)
  const sunrise = useWeatherStore((s) => s.sunrise)
  const sunset = useWeatherStore((s) => s.sunset)

  if (!weather) return null

  const now = new Date()
  const hour = now.getHours()
  const isNight = isNightAtTime(hour, now.getMinutes(), sunrise, sunset)

  return (
    <WeatherPillView
      code={weather.weatherCode}
      temperature={weather.temperature}
      hour={hour}
      isNight={isNight}
      precipProbability={precipitationProbability}
      sunrise={sunrise}
      sunset={sunset}
      expanded={expanded}
      onPress={onPress}
    />
  )
}
