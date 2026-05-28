import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CaretDownIcon, CaretLeftIcon, CaretRightIcon } from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import {
  type ExcludedRange,
  type TelemetryChartPoint,
  computeAutoRange,
  toExcludedRanges,
} from '@/components/charts/chartMath'
import {
  OPTIONAL_CHART_METRICS,
  toggleOptionalChartMetric,
  type OptionalChartMetric,
} from '@/components/history/historyChartMetrics'
import { IconButton } from '@/components/IconButton'
import { telemetry } from '@/constants/telemetry'
import { downsampleTimeSeries, findNearestSampleIndexByTime } from '@/lib/history/playback'
import { dutyPercent, fmtDutyPercent } from '@/helpers/format'
import { useHistoryStore, type TelemetrySample } from '@/store/historyStore'

interface HistoryTelemetryPanelProps {
  startAtMs: number
  endAtMs: number
  deviceName: string
  samples: TelemetrySample[]
  canPrevious: boolean
  canNext: boolean
  onPrevious: () => void
  onNext: () => void
  onOpenList: () => void
  onSeek?: (timeMs: number) => void
  onHeightChange?: (height: number) => void
}

const CHART_MAX_POINTS = 220
const OPTIONAL_CHART_TAB_COUNT = OPTIONAL_CHART_METRICS.length

function formatRideTime(startMs: number, endMs: number): string {
  const start = new Date(startMs)
  const end = new Date(endMs)
  const h = (d: Date) => d.getHours().toString().padStart(2, '0')
  const m = (d: Date) => d.getMinutes().toString().padStart(2, '0')
  return `${h(start)}:${m(start)} – ${h(end)}:${m(end)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatRideDate(startMs: number, endMs: number): string {
  const s = new Date(startMs)
  const e = new Date(endMs)
  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate()
  if (sameDay) {
    return `${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`
  }
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`
  }
  return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`
}

export function HistoryTelemetryPanel({
  startAtMs,
  endAtMs,
  deviceName,
  samples,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  onOpenList,
  onSeek,
  onHeightChange,
}: HistoryTelemetryPanelProps) {
  const insets = useSafeAreaInsets()
  const [headTimeMs, setHeadTimeMs] = useState<number | null>(null)
  const [activeCharts, setActiveCharts] = useState<Set<OptionalChartMetric>>(new Set())

  const sortedSamples = useMemo(
    () => [...samples].sort((a, b) => a.capturedAtMs - b.capturedAtMs),
    [samples],
  )
  const chartSamples = useMemo(
    () => downsampleTimeSeries(sortedSamples, CHART_MAX_POINTS, (sample) => sample.capturedAtMs),
    [sortedSamples],
  )

  const headSample = useMemo(() => {
    if (headTimeMs == null) return sortedSamples.at(-1) ?? null
    const idx = findNearestSampleIndexByTime(sortedSamples, headTimeMs)
    return idx >= 0 ? sortedSamples[idx] : (sortedSamples.at(-1) ?? null)
  }, [sortedSamples, headTimeMs])

  const speedPoints = useMemo<TelemetryChartPoint[]>(
    () => chartSamples.map((s) => ({ date: new Date(s.capturedAtMs), value: s.speedKmh })),
    [chartSamples],
  )
  const dutyPoints = useMemo<TelemetryChartPoint[]>(
    () =>
      chartSamples.map((s) => ({
        date: new Date(s.capturedAtMs),
        value: dutyPercent(s.dutyCycle, false),
      })),
    [chartSamples],
  )
  const batteryVoltagePoints = useMemo<TelemetryChartPoint[]>(
    () => chartSamples.map((s) => ({ date: new Date(s.capturedAtMs), value: s.batteryVoltage })),
    [chartSamples],
  )
  const tempMotorPoints = useMemo<TelemetryChartPoint[]>(
    () =>
      chartSamples
        .filter((s) => s.tempMotor != null)
        .map((s) => ({ date: new Date(s.capturedAtMs), value: s.tempMotor! })),
    [chartSamples],
  )
  const tempMosfetPoints = useMemo<TelemetryChartPoint[]>(
    () =>
      chartSamples
        .filter((s) => s.tempMosfet != null)
        .map((s) => ({ date: new Date(s.capturedAtMs), value: s.tempMosfet! })),
    [chartSamples],
  )
  const motorCurrentPoints = useMemo<TelemetryChartPoint[]>(
    () => chartSamples.map((s) => ({ date: new Date(s.capturedAtMs), value: s.motorCurrent })),
    [chartSamples],
  )
  const batteryCurrentPoints = useMemo<TelemetryChartPoint[]>(
    () => chartSamples.map((s) => ({ date: new Date(s.capturedAtMs), value: s.batteryCurrent })),
    [chartSamples],
  )

  const speedRange = useMemo(
    () =>
      computeAutoRange(speedPoints, {
        includeZero: true,
        minSpan: 10,
        paddingRatio: 0.1,
        fallbackMin: -5,
        fallbackMax: 5,
      }),
    [speedPoints],
  )
  const batteryRange = useMemo(
    () =>
      computeAutoRange(batteryVoltagePoints, {
        includeZero: false,
        minSpan: 5,
        paddingRatio: 0.1,
        fallbackMin: 30,
        fallbackMax: 60,
      }),
    [batteryVoltagePoints],
  )
  const tempMotorRange = useMemo(
    () =>
      computeAutoRange(tempMotorPoints, {
        includeZero: false,
        minSpan: 20,
        paddingRatio: 0.1,
        fallbackMin: 0,
        fallbackMax: 100,
      }),
    [tempMotorPoints],
  )
  const tempMosfetRange = useMemo(
    () =>
      computeAutoRange(tempMosfetPoints, {
        includeZero: false,
        minSpan: 20,
        paddingRatio: 0.1,
        fallbackMin: 0,
        fallbackMax: 100,
      }),
    [tempMosfetPoints],
  )
  const motorCurrentRange = useMemo(
    () =>
      computeAutoRange(motorCurrentPoints, {
        includeZero: true,
        minSpan: 10,
        paddingRatio: 0.1,
        fallbackMin: -5,
        fallbackMax: 5,
      }),
    [motorCurrentPoints],
  )
  const batteryCurrentRange = useMemo(
    () =>
      computeAutoRange(batteryCurrentPoints, {
        includeZero: true,
        minSpan: 5,
        paddingRatio: 0.1,
        fallbackMin: -5,
        fallbackMax: 5,
      }),
    [batteryCurrentPoints],
  )

  const bottomInset = Math.max(insets.bottom, 16) + 8

  const sessionExclusions = useHistoryStore((s) => s.sessionExclusions)
  const speedExcludedRanges = useMemo(
    () => toExcludedRanges(sessionExclusions, ['avg_speed', 'max_speed']),
    [sessionExclusions],
  )
  const dutyExcludedRanges = useMemo(
    () => toExcludedRanges(sessionExclusions, 'max_duty'),
    [sessionExclusions],
  )

  const hasChartData = headSample != null && sortedSamples.length >= 2

  const handlePointSelected = (point: TelemetryChartPoint) => {
    const ms = point.date.getTime()
    setHeadTimeMs(ms)
    onSeek?.(ms)
  }

  const headPoint: TelemetryChartPoint | null = headSample
    ? { date: new Date(headSample.capturedAtMs), value: headSample.speedKmh }
    : null

  const optionalChartConfig = headSample
    ? ({
        duty: {
          points: dutyPoints,
          range: computeAutoRange(dutyPoints, {
            includeZero: true,
            minSpan: 20,
            paddingRatio: 0.1,
            fallbackMin: 0,
            fallbackMax: 100,
          }),
          label: telemetry.duty.label,
          value: fmtDutyPercent(headSample.dutyCycle, false),
          headValue: dutyPercent(headSample.dutyCycle, false),
          color: telemetry.duty.color,
          formatValue: (v: number) => `${v.toFixed(1)}%`,
          excludedRanges: dutyExcludedRanges,
        },
        battery: {
          points: batteryVoltagePoints,
          range: batteryRange,
          label: telemetry.battVoltage.label,
          value: telemetry.battVoltage.formatWithUnit(headSample.batteryVoltage),
          headValue: headSample.batteryVoltage,
          color: telemetry.battVoltage.color,
          formatValue: (v: number) => telemetry.battVoltage.formatWithUnit(v),
        },
        tempMotor: {
          points: tempMotorPoints,
          range: tempMotorRange,
          label: telemetry.motorTemp.label,
          value:
            headSample.tempMotor == null
              ? '-'
              : telemetry.motorTemp.formatWithUnit(headSample.tempMotor),
          headValue: headSample.tempMotor ?? 0,
          color: telemetry.motorTemp.color,
          formatValue: (v: number) => telemetry.motorTemp.formatWithUnit(v),
        },
        tempController: {
          points: tempMosfetPoints,
          range: tempMosfetRange,
          label: telemetry.controllerTemp.label,
          value:
            headSample.tempMosfet == null
              ? '-'
              : telemetry.controllerTemp.formatWithUnit(headSample.tempMosfet),
          headValue: headSample.tempMosfet ?? 0,
          color: telemetry.controllerTemp.color,
          formatValue: (v: number) => telemetry.controllerTemp.formatWithUnit(v),
        },
        motorCurrent: {
          points: motorCurrentPoints,
          range: motorCurrentRange,
          label: telemetry.motorCurrent.label,
          value: telemetry.motorCurrent.formatWithUnit(headSample.motorCurrent),
          headValue: headSample.motorCurrent,
          color: telemetry.motorCurrent.color,
          formatValue: (v: number) => telemetry.motorCurrent.formatWithUnit(v),
        },
        batteryCurrent: {
          points: batteryCurrentPoints,
          range: batteryCurrentRange,
          label: telemetry.battCurrent.label,
          value: telemetry.battCurrent.formatWithUnit(headSample.batteryCurrent),
          headValue: headSample.batteryCurrent,
          color: telemetry.battCurrent.color,
          formatValue: (v: number) => telemetry.battCurrent.formatWithUnit(v),
        },
      } satisfies Record<
        OptionalChartMetric,
        {
          points: TelemetryChartPoint[]
          range: ReturnType<typeof computeAutoRange>
          label: string
          value: string
          headValue: number
          color: string
          formatValue: (v: number) => string
          excludedRanges?: ExcludedRange[]
        }
      >)
    : null

  return (
    <View
      style={[styles.panel, { bottom: bottomInset }]}
      onLayout={(e) => onHeightChange?.(e.nativeEvent.layout.height)}
    >
      <View style={styles.navRow}>
        <IconButton icon={CaretLeftIcon} size="lg" onPress={onPrevious} disabled={!canPrevious} />
        <Pressable style={styles.titleButton} onPress={onOpenList}>
          <View style={styles.titleContent}>
            <Text style={styles.titleTime} numberOfLines={1}>
              {formatRideTime(startAtMs, endAtMs)}
            </Text>
            <Text style={styles.titleMeta} numberOfLines={1}>
              {formatRideDate(startAtMs, endAtMs)} · {deviceName}
            </Text>
          </View>
          <CaretDownIcon size={12} color="#64748b" weight="bold" />
        </Pressable>
        <IconButton icon={CaretRightIcon} size="lg" onPress={onNext} disabled={!canNext} />
      </View>
      {hasChartData && headPoint && optionalChartConfig && (
        <>
          <TelemetryLineChart
            label={telemetry.speed.label}
            value={telemetry.speed.formatWithUnit(headSample!.speedKmh)}
            points={speedPoints}
            color={telemetry.speed.color}
            range={speedRange}
            currentPoint={headPoint}
            height={48}
            containerStyle={styles.chart}
            formatValue={(v) => telemetry.speed.formatWithUnit(v)}
            onPointSelected={(point) => handlePointSelected(point)}
            excludedRanges={speedExcludedRanges}
          />

          {OPTIONAL_CHART_METRICS.filter((m) => activeCharts.has(m.key)).map((metric) => {
            const cfg = optionalChartConfig[metric.key]
            return (
              <TelemetryLineChart
                key={metric.key}
                label={cfg.label}
                value={cfg.value}
                points={cfg.points}
                color={cfg.color}
                range={cfg.range}
                currentPoint={{ date: new Date(headSample!.capturedAtMs), value: cfg.headValue }}
                height={40}
                containerStyle={styles.chart}
                formatValue={cfg.formatValue}
                onPointSelected={(point) => handlePointSelected(point)}
                excludedRanges={
                  'excludedRanges' in cfg
                    ? (cfg.excludedRanges as ExcludedRange[] | undefined)
                    : undefined
                }
              />
            )
          })}

          <View style={styles.metricTabs}>
            {OPTIONAL_CHART_METRICS.map((metric, index) => {
              const active = activeCharts.has(metric.key)
              const cfg = optionalChartConfig[metric.key]
              return (
                <Pressable
                  key={metric.key}
                  style={[
                    styles.metricTab,
                    index < OPTIONAL_CHART_METRICS.length - 1 && styles.metricTabDivider,
                    active && styles.metricTabActive,
                  ]}
                  onPress={() =>
                    setActiveCharts((prev) => toggleOptionalChartMetric(prev, metric.key))
                  }
                >
                  <View
                    style={[
                      styles.metricTabLine,
                      { backgroundColor: active ? cfg.color : '#1e293b' },
                    ]}
                  />
                  {metric.multilineLabel ? (
                    <View style={styles.metricTabTextStack}>
                      <Text
                        style={[styles.metricTabText, active && styles.metricTabTextActive]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {metric.multilineLabel[0]}
                      </Text>
                      <Text
                        style={[styles.metricTabText, active && styles.metricTabTextActive]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {metric.multilineLabel[1]}
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={[styles.metricTabText, active && styles.metricTabTextActive]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {metric.label}
                    </Text>
                  )}
                </Pressable>
              )
            })}
          </View>
          <View style={styles.metricLegend}>
            <View style={styles.metricLegendItem}>
              <View style={[styles.metricLegendLine, { backgroundColor: '#94a3b8' }]} />
              <Text style={styles.metricLegendText} numberOfLines={1}>
                Low speed
              </Text>
            </View>
            <View style={styles.metricLegendItem}>
              <View style={[styles.metricLegendLine, { backgroundColor: '#facc15' }]} />
              <Text style={styles.metricLegendText} numberOfLines={1}>
                Free spin
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 8,
    right: 8,
    zIndex: 20,
    gap: 8,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: 280,
    gap: 6,
  },
  titleButton: {
    flex: 1,
    minWidth: 0,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleContent: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  titleTime: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
  },
  titleMeta: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '600',
  },
  chart: {
    minHeight: 72,
  },
  metricTabs: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
  },
  metricTab: {
    width: `${100 / OPTIONAL_CHART_TAB_COUNT}%`,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 10,
  },
  metricTabDivider: {
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },
  metricTabActive: {
    backgroundColor: '#172554',
  },
  metricTabLine: {
    width: '60%',
    height: 3,
    borderRadius: 2,
    marginBottom: 6,
  },
  metricTabTextStack: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  metricTabText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    width: '100%',
    textAlign: 'center',
    lineHeight: 12,
  },
  metricTabTextActive: {
    color: '#dbeafe',
  },
  metricLegend: {
    marginTop: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 8,
    rowGap: 3,
    paddingHorizontal: 6,
  },
  metricLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '48%',
  },
  metricLegendLine: {
    width: 6,
    height: 1,
    borderRadius: 0.5,
  },
  metricLegendText: {
    color: '#64748b',
    fontSize: 8,
    fontWeight: '600',
  },
  empty: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
  },
})
