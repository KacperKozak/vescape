import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useMemo, useState } from 'react'
import { useSharedValue } from 'react-native-reanimated'

import { SingleGauge } from '@/components/ui/charts/DualGauge'
import { Sparkline, type SparklinePoint } from '@/components/ui/charts/Sparkline'
import { ShowcaseCard } from '@/components/ui/dev/ShowcaseCard'
import { ChipRow, ToggleRow } from '@/components/ui/dev/ShowcaseControls'
import { theme } from '@/constants/theme'
import { telemetry } from '@/constants/telemetry'

function generateSparklineData(count: number, base: number, variance: number): SparklinePoint[] {
  const now = Date.now()
  const points: SparklinePoint[] = []
  let value = base
  for (let i = 0; i < count; i++) {
    value += (Math.random() - 0.48) * variance
    value = Math.max(base - variance * 3, Math.min(base + variance * 3, value))
    points.push({ ts: now - (count - i) * 1000, value })
  }
  return points
}

function SparklineShowcase() {
  const [showMax, setShowMax] = useState(true)
  const [maxPosition, setMaxPosition] = useState<'left' | 'right'>('right')
  const [color, setColor] = useState('#38bdf8')
  const points = useMemo(() => generateSparklineData(120, 42, 2), [])

  return (
    <ShowcaseCard
      name="Sparkline"
      controls={
        <>
          <ToggleRow label="showMaxBadge" value={showMax} onToggle={setShowMax} />
          <ChipRow
            label="maxPosition"
            options={['left', 'right']}
            selected={maxPosition}
            onSelect={(v) => setMaxPosition(v as 'left' | 'right')}
          />
          <ChipRow
            label="color"
            options={['#38bdf8', '#4ade80', '#f87171', '#facc15']}
            selected={color}
            onSelect={setColor}
          />
        </>
      }
    >
      <Sparkline
        points={points}
        color={color}
        height={32}
        fmtMax={(v) => `${v.toFixed(1)} V`}
        showMaxBadge={showMax}
        maxPosition={maxPosition}
      />
    </ShowcaseCard>
  )
}

function SingleGaugeShowcase() {
  const [metricKey, setMetricKey] = useState<'speed' | 'duty' | 'battVoltage'>('speed')
  const value = useSharedValue<number | null>(34)
  const metric = telemetry[metricKey]

  const handleMetricChange = useCallback(
    (next: string) => {
      const key = next as typeof metricKey
      setMetricKey(key)
      // eslint-disable-next-line react-hooks/immutability
      value.value = key === 'speed' ? 34 : key === 'duty' ? 68 : 42.5
    },
    [value],
  )

  return (
    <ShowcaseCard
      name="SingleGauge"
      controls={
        <ChipRow
          label="metric"
          options={['speed', 'duty', 'battVoltage']}
          selected={metricKey}
          onSelect={handleMetricChange}
        />
      }
    >
      <SingleGauge
        value={value}
        min={metric.chartRange.min}
        max={metric.chartRange.max}
        color={metric.color}
        unit={metric.unit}
        decimals={metric.decimals}
        label={metric.label.toUpperCase()}
        alerts={[
          { id: 'warn', threshold: metric.chartRange.max * 0.75, thresholdMax: null },
          {
            id: 'range',
            threshold: metric.chartRange.max * 0.88,
            thresholdMax: metric.chartRange.max * 0.98,
          },
        ]}
      />
    </ShowcaseCard>
  )
}

export default function ChartsPage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SparklineShowcase />
        <SingleGaugeShowcase />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.neutral.bg },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
})
