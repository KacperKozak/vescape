import {
  CloudFogIcon,
  CloudIcon,
  CloudLightningIcon,
  CloudMoonIcon,
  CloudRainIcon,
  CloudSnowIcon,
  CloudSunIcon,
  MoonStarsIcon,
  SunIcon,
  type Icon,
} from 'phosphor-react-native'

import { weatherCodeToIconName, type WeatherIconName } from '@/lib/weather'

const ICON_MAP: Record<WeatherIconName, Icon> = {
  sun: SunIcon,
  moon: MoonStarsIcon,
  'cloud-sun': CloudSunIcon,
  'cloud-moon': CloudMoonIcon,
  cloud: CloudIcon,
  'cloud-fog': CloudFogIcon,
  'cloud-rain': CloudRainIcon,
  'cloud-snow': CloudSnowIcon,
  'cloud-lightning': CloudLightningIcon,
}

interface WeatherIconProps {
  code: number
  hour?: number
  size?: number
  color?: string
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
}

export function WeatherIcon({
  code,
  hour,
  size = 20,
  color = '#94a3b8',
  weight = 'duotone',
}: WeatherIconProps) {
  const name = weatherCodeToIconName(code, hour)
  const IconComponent = ICON_MAP[name]
  return <IconComponent size={size} color={color} weight={weight} />
}
