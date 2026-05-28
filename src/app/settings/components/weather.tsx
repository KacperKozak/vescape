import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState } from 'react'

import { WeatherIcon } from '@/components/ui/weather/WeatherIcon'
import { ShowcaseCard } from '@/components/ui/dev/ShowcaseCard'
import { ChipRow } from '@/components/ui/dev/ShowcaseControls'

export default function WeatherPage() {
  const [code, setCode] = useState(0)

  const weatherCodes = [
    { code: 0, label: 'Clear' },
    { code: 1, label: 'Cloudy' },
    { code: 45, label: 'Fog' },
    { code: 51, label: 'Drizzle' },
    { code: 61, label: 'Rain' },
    { code: 71, label: 'Snow' },
    { code: 95, label: 'Storm' },
  ]

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ShowcaseCard
          name="WeatherIcon"
          controls={
            <ChipRow
              label="weather"
              options={weatherCodes.map((w) => w.label.toLowerCase())}
              selected={weatherCodes.find((w) => w.code === code)!.label.toLowerCase()}
              onSelect={(label) => {
                const found = weatherCodes.find((w) => w.label.toLowerCase() === label)
                if (found) setCode(found.code)
              }}
            />
          }
        >
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', paddingVertical: 8 }}>
            <WeatherIcon code={code} size={48} color="#38bdf8" />
            <View>
              <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600' }}>
                Code: {code}
              </Text>
              <Text style={{ color: '#64748b', fontSize: 11 }}>
                {weatherCodes.find((w) => w.code === code)?.label ?? 'Unknown'}
              </Text>
            </View>
          </View>
        </ShowcaseCard>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
})
