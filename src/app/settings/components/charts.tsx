import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Easing, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'

import { BatteryBar } from '@/components/ui/base/BatteryBar'
import { TelemetryLineChart } from '@/components/ui/charts/TelemetryLineChart'
import { computeAutoRange, type TelemetryChartPoint } from '@/components/ui/charts/chartMath'
import { SingleGauge } from '@/components/ui/charts/DualGauge'
import { Sparkline, type SparklinePoint } from '@/components/ui/charts/Sparkline'
import { ShowcaseCard } from '@/components/ui/dev/ShowcaseCard'
import { ChipRow, ToggleRow } from '@/components/ui/dev/ShowcaseControls'
import { theme } from '@/constants/theme'
import { telemetry } from '@/constants/telemetry'
import {
  getHistoryMetricHotRange,
  getHistoryMetricColorRange,
  getMetricRampColor,
  type HistoryMetricKey,
} from '@/lib/history/metricColorScale'

function seededRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

function generateSparklineData(
  count: number,
  base: number,
  variance: number,
  seed: number,
): SparklinePoint[] {
  const now = Date.now()
  const random = seededRandom(seed)
  const points: SparklinePoint[] = []
  let value = base
  for (let i = 0; i < count; i++) {
    value += (random() - 0.48) * variance
    value = Math.max(base - variance * 3, Math.min(base + variance * 3, value))
    points.push({ ts: now - (count - i) * 1000, value })
  }
  return points
}

function generateChartData({
  count,
  base,
  variance,
  seed,
  drift = 0,
  spikeEvery = 0,
}: {
  count: number
  base: number
  variance: number
  seed: number
  drift?: number
  spikeEvery?: number
}): TelemetryChartPoint[] {
  const now = Date.now()
  const random = seededRandom(seed)
  const points: TelemetryChartPoint[] = []
  let value = base
  for (let i = 0; i < count; i += 1) {
    value += (random() - 0.5) * variance + drift
    if (spikeEvery > 0 && i % spikeEvery === 0) value += variance * (1.8 + random())
    points.push({ date: new Date(now - (count - i) * 1000), value: Math.max(0, value) })
  }
  return points
}

function SparklineShowcase() {
  const [showMax, setShowMax] = useState(true)
  const [maxPosition, setMaxPosition] = useState<'left' | 'right'>('right')
  const [color, setColor] = useState(telemetry.speed.color)
  const points = useMemo(() => generateSparklineData(120, 42, 2, 11), [])

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
            options={[
              telemetry.speed.color,
              telemetry.duty.color,
              telemetry.controllerTemp.color,
              theme.highlight.color,
            ]}
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

function AnimatedSingleGaugeShowcase() {
  const [metricKey, setMetricKey] = useState<'speed' | 'duty' | 'motorTemp' | 'controllerTemp'>(
    'speed',
  )
  const value = useSharedValue<number | null>(34)
  const metric = telemetry[metricKey]
  const hotMetricKey: HistoryMetricKey =
    metricKey === 'motorTemp'
      ? 'tempMotor'
      : metricKey === 'controllerTemp'
        ? 'tempController'
        : metricKey
  const hotRange = getHistoryMetricHotRange(hotMetricKey)

  useEffect(() => {
    value.value = 0
    value.value = withRepeat(
      withTiming(metric.chartRange.max, {
        duration: 1800,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    )
  }, [metric.chartRange.max, value])

  const handleMetricChange = useCallback((next: string) => {
    const key = next as typeof metricKey
    setMetricKey(key)
  }, [])

  return (
    <ShowcaseCard
      name="SingleGauge / animated ramp"
      controls={
        <ChipRow
          label="metric"
          options={['speed', 'duty', 'motorTemp', 'controllerTemp']}
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
        hotRange={hotRange}
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

function BatteryBarShowcase() {
  const [empty, setEmpty] = useState(false)
  const points = useMemo(() => generateSparklineData(60, 82, 3, 42), [])

  return (
    <ShowcaseCard
      name="BatteryBar"
      controls={
        <>
          <ToggleRow label="empty" value={empty} onToggle={setEmpty} />
        </>
      }
    >
      <BatteryBar
        percent={empty ? null : 82}
        voltage={empty ? null : 74.5}
        series={empty ? [] : points}
        range={{ min: 42, max: 84 }}
      />
    </ShowcaseCard>
  )
}

function RandomLineChartsShowcase() {
  const charts = useMemo(
    () => [
      {
        key: 'speed',
        metricKey: 'speed' as HistoryMetricKey,
        label: 'Speed / noisy ride',
        metric: telemetry.speed,
        points: generateChartData({ count: 160, base: 18, variance: 5, seed: 21, spikeEvery: 29 }),
      },
      {
        key: 'duty',
        metricKey: 'duty' as HistoryMetricKey,
        label: 'Duty / punchy acceleration',
        metric: telemetry.duty,
        points: generateChartData({ count: 160, base: 40, variance: 8, seed: 37, spikeEvery: 17 }),
      },
      {
        key: 'controller',
        metricKey: 'tempController' as HistoryMetricKey,
        label: 'Controller temp / slow climb',
        metric: telemetry.controllerTemp,
        points: generateChartData({ count: 160, base: 32, variance: 1.8, seed: 53, drift: 0.16 }),
      },
    ],
    [],
  )

  return (
    <ShowcaseCard name="TelemetryLineChart / random samples">
      {charts.map((chart) => {
        const range = computeAutoRange(chart.points, {
          includeZero: chart.key !== 'controller',
          minSpan: chart.metric.minSpan ?? 10,
          paddingRatio: 0.1,
          baseline: chart.key === 'controller' ? chart.metric.chartRange : undefined,
        })
        const colorRange = getHistoryMetricColorRange(chart.metricKey, chart.metric.color)
        const currentPoint = chart.points.at(-1) ?? null
        return (
          <TelemetryLineChart
            key={chart.key}
            label={chart.label}
            value={currentPoint ? chart.metric.formatWithUnit(currentPoint.value) : '-'}
            points={chart.points}
            currentPoint={currentPoint}
            color={chart.metric.color}
            range={range}
            height={70}
            formatValue={chart.metric.formatWithUnit}
            getPointColor={
              colorRange ? (value) => getMetricRampColor(value, colorRange) : undefined
            }
            containerStyle={styles.chartExample}
          />
        )
      })}
    </ShowcaseCard>
  )
}

export default function ChartsPage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SparklineShowcase />
        <BatteryBarShowcase />
        <AnimatedSingleGaugeShowcase />
        <RandomLineChartsShowcase />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.neutral.bg },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
  chartExample: { marginBottom: 10 },
})
