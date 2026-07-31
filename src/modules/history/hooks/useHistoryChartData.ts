import { useMemo } from 'react'

import {
  computeAutoRange,
  toExcludedRanges,
  type ExcludedRange,
  type TelemetryChartPoint,
  type TelemetryChartRange,
} from '@/components/charts/chartMath'
import type { SecondaryChartSeries } from '@/components/charts/TelemetryLineChart'
import { telemetry } from '@/modules/board/constants/telemetry'
import {
  HISTORY_CHART_DEFS,
  OPTIONAL_CHART_METRICS,
  type OptionalChartMetric,
  type OptionalChartMetricDef,
} from '@/modules/history/components/historyChartMetrics'
import {
  getHistoryMetricColorRange,
  getMetricRampColor,
  getTelemetrySampleMetricValue,
  type HistoryMetricKey,
} from '@/modules/history/lib/metricColorScale'
import { downsampleTimeSeries, findNearestSampleIndexByTime } from '@/modules/history/lib/playback'
import { RIDE_TRIM_PADDING_MS, rideMovingWindow } from '@/modules/history/lib/sessions'
import { useHistoryStore, type TelemetrySample } from '@/modules/history/store/historyStore'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'
import { useResolvedNeutralColors } from '@/hooks/useTheme'

const CHART_MAX_POINTS = 220

export function useVisibleRideSamples(
  samples: TelemetrySample[],
  movingStartAtMs: number | null,
  movingEndAtMs: number | null,
  headTimeMs: number | null,
) {
  const sortedSamples = useMemo(
    () => [...samples].sort((a, b) => a.capturedAtMs - b.capturedAtMs),
    [samples],
  )
  // Trim leading/trailing idle to the Moving Window (± display padding). Falls back to the full
  // sample range on legacy rides that have no precomputed window.
  const visibleSamples = useMemo(() => {
    const window = rideMovingWindow({ movingStartAtMs, movingEndAtMs })
    if (!window) return sortedSamples
    const lo = window.startMs - RIDE_TRIM_PADDING_MS
    const hi = window.endMs + RIDE_TRIM_PADDING_MS
    const trimmed = sortedSamples.filter((s) => s.capturedAtMs >= lo && s.capturedAtMs <= hi)
    return trimmed.length > 0 ? trimmed : sortedSamples
  }, [sortedSamples, movingStartAtMs, movingEndAtMs])
  const chartSamples = useMemo(
    () => downsampleTimeSeries(visibleSamples, CHART_MAX_POINTS, (sample) => sample.capturedAtMs),
    [visibleSamples],
  )
  const headSample = useMemo(() => {
    if (headTimeMs == null) return visibleSamples.at(-1) ?? null
    const idx = findNearestSampleIndexByTime(visibleSamples, headTimeMs)
    return idx >= 0 ? visibleSamples[idx] : (visibleSamples.at(-1) ?? null)
  }, [visibleSamples, headTimeMs])
  return { visibleSamples, chartSamples, headSample }
}

export function useChartSeries(chartSamples: TelemetrySample[]) {
  return useMemo(() => {
    const series = {} as Record<HistoryMetricKey, TelemetryChartPoint[]>
    for (const def of HISTORY_CHART_DEFS) series[def.key] = []
    for (const sample of chartSamples) {
      const date = new Date(sample.capturedAtMs)
      for (const def of HISTORY_CHART_DEFS) {
        const value = getTelemetrySampleMetricValue(sample, def.key)
        if (value != null) series[def.key].push({ date, value })
      }
    }
    return series
  }, [chartSamples])
}

export function useChartRanges(series: Record<HistoryMetricKey, TelemetryChartPoint[]>) {
  return useMemo(() => {
    const ranges = {} as Record<HistoryMetricKey, TelemetryChartRange>
    for (const def of HISTORY_CHART_DEFS) {
      ranges[def.key] = computeAutoRange(series[def.key], def.range)
    }
    return ranges
  }, [series])
}

export function useMetricPointColors() {
  const gradientsEnabled = useSettingsStore((s) => s.historyMetricGradientsEnabled)
  const hotRanges = useSettingsStore((s) => s.historyMetricHotRanges)
  return useMemo(() => {
    const colors = {} as Record<HistoryMetricKey, ((value: number) => string) | undefined>
    for (const def of HISTORY_CHART_DEFS) {
      const range = getHistoryMetricColorRange(def.key, def.color, hotRanges, gradientsEnabled)
      colors[def.key] = range ? (value: number) => getMetricRampColor(value, range) : undefined
    }
    return colors
  }, [gradientsEnabled, hotRanges])
}

export function useChartExcludedRanges() {
  const sessionExclusions = useHistoryStore((s) => s.sessionExclusions)
  return useMemo(() => {
    const excluded = {} as Record<HistoryMetricKey, ExcludedRange[] | undefined>
    for (const def of HISTORY_CHART_DEFS) {
      excluded[def.key] = def.statKeys
        ? toExcludedRanges(sessionExclusions, def.statKeys)
        : undefined
    }
    return excluded
  }, [sessionExclusions])
}

interface OptionalChartConfig {
  points: TelemetryChartPoint[]
  range: TelemetryChartRange
  label: string
  value: string
  headValue: number
  color: string
  getPointColor: ((value: number) => string) | undefined
  formatValue: (value: number) => string
  excludedRanges?: ExcludedRange[]
  secondary?: SecondaryChartSeries
}

interface OptionalChartConfigInput {
  headSample: TelemetrySample | null
  chartSamples: TelemetrySample[]
  series: Record<HistoryMetricKey, TelemetryChartPoint[]>
  ranges: Record<HistoryMetricKey, TelemetryChartRange>
  pointColors: Record<HistoryMetricKey, ((value: number) => string) | undefined>
  excludedRanges: Record<HistoryMetricKey, ExcludedRange[] | undefined>
}

export function useOptionalChartConfig({
  headSample,
  chartSamples,
  series,
  ranges,
  pointColors,
  excludedRanges,
}: OptionalChartConfigInput): Record<OptionalChartMetric, OptionalChartConfig> | null {
  const neutral = useResolvedNeutralColors()
  const batteryPercentPoints = useMemo(
    () =>
      chartSamples
        .filter((s) => s.batteryPercent != null)
        .map((s) => ({ date: new Date(s.capturedAtMs), value: s.batteryPercent! })),
    [chartSamples],
  )
  if (!headSample) return null
  const config = {} as Record<OptionalChartMetric, OptionalChartConfig>
  for (const def of OPTIONAL_CHART_METRICS) {
    config[def.key] =
      def.key === 'battery'
        ? buildBatteryConfig(
            headSample,
            batteryPercentPoints,
            series.battery,
            ranges.battery,
            pointColors.battery,
            neutral.textMuted,
          )
        : buildMetricConfig(
            def,
            headSample,
            series[def.key],
            ranges[def.key],
            pointColors[def.key],
            excludedRanges[def.key],
          )
  }
  return config
}

function buildMetricConfig(
  def: OptionalChartMetricDef,
  headSample: TelemetrySample,
  points: TelemetryChartPoint[],
  range: TelemetryChartRange,
  getPointColor: ((value: number) => string) | undefined,
  excludedRanges: ExcludedRange[] | undefined,
): OptionalChartConfig {
  const headValue = getTelemetrySampleMetricValue(headSample, def.key)
  const formatHead = def.formatHeadValue ?? def.formatValue
  return {
    points,
    range,
    label: def.label,
    value: headValue == null ? '-' : formatHead(headValue),
    headValue: headValue ?? 0,
    color: def.color,
    getPointColor,
    formatValue: def.formatValue,
    excludedRanges,
  }
}

function buildBatteryConfig(
  headSample: TelemetrySample,
  percentPoints: TelemetryChartPoint[],
  voltagePoints: TelemetryChartPoint[],
  voltageRange: TelemetryChartRange,
  voltagePointColor: ((value: number) => string) | undefined,
  secondaryColor: string,
): OptionalChartConfig {
  if (percentPoints.length > 0) {
    return {
      // % is the main green line; voltage rides under it as dim gray.
      points: percentPoints,
      range: { y: { min: 0, max: 100 } },
      label: 'Battery',
      value: headSample.batteryPercent != null ? `${Math.round(headSample.batteryPercent)}%` : '-',
      headValue: headSample.batteryPercent ?? 0,
      color: telemetry.battVoltage.color,
      getPointColor: undefined,
      formatValue: (v) => `${Math.round(v)}%`,
      secondary: {
        points: voltagePoints,
        range: voltageRange,
        color: secondaryColor,
        value: telemetry.battVoltage.formatWithUnit(headSample.batteryVoltage),
        formatValue: telemetry.battVoltage.formatWithUnit,
      },
    }
  }
  // No derived % for this ride (no pack config) — fall back to voltage only.
  return {
    points: voltagePoints,
    range: voltageRange,
    label: 'Battery',
    value: telemetry.battVoltage.formatWithUnit(headSample.batteryVoltage),
    headValue: headSample.batteryVoltage,
    color: telemetry.battVoltage.color,
    getPointColor: voltagePointColor,
    formatValue: telemetry.battVoltage.formatWithUnit,
  }
}
