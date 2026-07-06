import { ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState } from 'react'

import { CloudMoonIcon } from 'phosphor-react-native'
import { WeatherIcon } from '@/components/ui/weather/WeatherIcon'
import { WeatherStat } from '@/components/ui/weather/WeatherStat'
import { WeatherPill } from '@/components/ui/weather/WeatherPill'
import { WeatherHourlyStrip } from '@/components/ui/weather/WeatherHourlyStrip'
import { IconHero } from '@/components/ui/settings/IconHero'
import { ShowcaseCard } from '@/components/ui/dev/ShowcaseCard'
import { ChipRow, ToggleRow } from '@/components/ui/dev/ShowcaseControls'
import { weatherCodeToColor, type WeatherHourForecast } from '@/lib/weather'
import { theme } from '@/constants/theme'

const weatherCodes = [
  { code: 0, label: 'clear' },
  { code: 1, label: 'cloudy' },
  { code: 45, label: 'fog' },
  { code: 51, label: 'drizzle' },
  { code: 61, label: 'rain' },
  { code: 71, label: 'snow' },
  { code: 95, label: 'storm' },
]

const MOCK_SUNRISE = '2026-06-26T05:12'
const MOCK_SUNSET = '2026-06-26T21:34'

const MOCK_HOURLY: WeatherHourForecast[] = [
  {
    hour: '14:00',
    hourNum: 14,
    minuteNum: 0,
    temperature: 21,
    weatherCode: 0,
    precipitationProbability: 0,
  },
  {
    hour: '15:00',
    hourNum: 15,
    minuteNum: 0,
    temperature: 22,
    weatherCode: 1,
    precipitationProbability: 10,
  },
  {
    hour: '16:00',
    hourNum: 16,
    minuteNum: 0,
    temperature: 20,
    weatherCode: 61,
    precipitationProbability: 60,
  },
  {
    hour: '17:00',
    hourNum: 17,
    minuteNum: 0,
    temperature: 18,
    weatherCode: 95,
    precipitationProbability: 80,
  },
  {
    hour: '18:00',
    hourNum: 18,
    minuteNum: 0,
    temperature: 17,
    weatherCode: 3,
    precipitationProbability: 30,
  },
  {
    hour: '22:00',
    hourNum: 22,
    minuteNum: 0,
    temperature: 13,
    weatherCode: 1,
    precipitationProbability: 0,
  },
]

export default function WeatherPage() {
  const [code, setCode] = useState(0)
  const [isNight, setIsNight] = useState(false)
  const [precip, setPrecip] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const hour = isNight ? 23 : 13
  const precipProbability = precip ? 40 : 0
  const label = weatherCodes.find((w) => w.code === code)?.label ?? 'unknown'

  const sharedControls = (
    <>
      <ChipRow
        label="weather"
        options={weatherCodes.map((w) => w.label)}
        selected={label}
        onSelect={(l) => {
          const found = weatherCodes.find((w) => w.label === l)
          if (found) setCode(found.code)
        }}
      />
      <ToggleRow label="night" value={isNight} onToggle={setIsNight} />
      <ToggleRow label="precipitation" value={precip} onToggle={setPrecip} />
    </>
  )

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero icon={CloudMoonIcon} description="Weather icons, stat, pill, and hourly strip." />

        <ShowcaseCard name="WeatherIcon" controls={sharedControls}>
          <View style={styles.iconPreview}>
            <WeatherIcon
              code={code}
              hour={hour}
              isNight={isNight}
              size={48}
              color={weatherCodeToColor(code, hour, isNight)}
              weight="duotone"
            />
            <View>
              <Text style={styles.metaPrimary}>Code: {code}</Text>
              <Text style={styles.metaSecondary}>{label}</Text>
            </View>
          </View>
        </ShowcaseCard>

        <ShowcaseCard name="WeatherStat">
          <View style={styles.statPreview}>
            <WeatherStat
              code={code}
              temperature={21}
              hour={hour}
              isNight={isNight}
              precipProbability={precipProbability}
              size="sm"
            />
            <WeatherStat
              code={code}
              temperature={21}
              hour={hour}
              isNight={isNight}
              precipProbability={precipProbability}
              size="md"
              iconColor={weatherCodeToColor(code, hour, isNight)}
            />
          </View>
        </ShowcaseCard>

        <ShowcaseCard
          name="WeatherPill"
          controls={<ToggleRow label="expanded" value={expanded} onToggle={setExpanded} />}
        >
          <View style={styles.pillPreview}>
            <WeatherPill
              code={code}
              temperature={21}
              hour={hour}
              isNight={isNight}
              precipProbability={precipProbability}
              sunrise={MOCK_SUNRISE}
              sunset={MOCK_SUNSET}
              expanded={expanded}
              onPress={() => undefined}
            />
          </View>
        </ShowcaseCard>

        <ShowcaseCard name="WeatherHourlyStrip">
          <View style={styles.stripPreview}>
            <WeatherHourlyStrip hours={MOCK_HOURLY} sunrise={MOCK_SUNRISE} sunset={MOCK_SUNSET} />
          </View>
        </ShowcaseCard>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.palette.slate.bg },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
  iconPreview: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingVertical: 8 },
  metaPrimary: { color: theme.palette.slate.textSecondary, fontSize: 12, fontWeight: '600' },
  metaSecondary: { color: theme.palette.slate.textDim, fontSize: 11 },
  statPreview: { flexDirection: 'row', gap: 24, alignItems: 'center', paddingVertical: 8 },
  pillPreview: { alignItems: 'flex-start', paddingVertical: 8 },
  stripPreview: { marginHorizontal: -14, paddingVertical: 8 },
})
