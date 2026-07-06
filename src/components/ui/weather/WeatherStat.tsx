import { DropIcon } from 'phosphor-react-native'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/base/Text'

import { WeatherIcon } from '@/components/ui/weather/WeatherIcon'
import { theme } from '@/constants/theme'

type WeatherStatSize = 'sm' | 'md'

interface WeatherStatProps {
  code: number
  temperature: number
  hour: number
  isNight: boolean
  precipProbability?: number | null
  size?: WeatherStatSize
  /** Override the weather icon tint. Defaults to muted secondary text. */
  iconColor?: string
}

const SIZES: Record<WeatherStatSize, { icon: number; temp: number; drop: number }> = {
  sm: { icon: 13, temp: 11, drop: 11 },
  md: { icon: 16, temp: 13, drop: 12 },
}

/** Inline icon + temperature + precipitation. Shared atom for the top bar and pill. */
export function WeatherStat({
  code,
  temperature,
  hour,
  isNight,
  precipProbability,
  size = 'sm',
  iconColor = theme.palette.slate.textSecondary,
}: WeatherStatProps) {
  const dims = SIZES[size]
  const tempColor =
    size === 'md' ? theme.palette.slate.textPrimary : theme.palette.slate.textSecondary

  return (
    <View style={styles.row}>
      <WeatherIcon
        code={code}
        hour={hour}
        isNight={isNight}
        size={dims.icon}
        color={iconColor}
        weight="duotone"
      />
      <Text style={[styles.temp, { color: tempColor, fontSize: dims.temp }]}>{temperature}°</Text>
      {precipProbability != null && precipProbability > 0 && (
        <>
          <DropIcon size={dims.drop} color={theme.palette.sky.color} weight="duotone" />
          <Text style={styles.precip}>{precipProbability}%</Text>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  temp: {
    fontWeight: '600',
  },
  precip: {
    color: theme.palette.sky.color,
    fontSize: 11,
    fontWeight: '600',
  },
})
