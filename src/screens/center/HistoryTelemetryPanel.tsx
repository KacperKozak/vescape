import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ImagesSquareIcon,
  CloudArrowUpIcon,
} from 'phosphor-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  OPTIONAL_CHART_METRICS,
  toggleOptionalChartMetric,
  type OptionalChartMetric,
} from '@/components/domain/history/historyChartMetrics'
import { IconButton } from '@/components/ui/base/IconButton'
import {
  computeAutoRange,
  toExcludedRanges,
  type ExcludedRange,
  type TelemetryChartPoint,
} from '@/components/ui/charts/chartMath'
import {
  TelemetryLineChart,
  type SecondaryChartSeries,
} from '@/components/ui/charts/TelemetryLineChart'
import { InfoModal } from '@/components/ui/modals/InfoModal'
import { telemetry } from '@/constants/telemetry'
import { interaction, theme } from '@/constants/theme'
import { dutyPercent, fmtDutyPercent } from '@/helpers/format'
import {
  getHistoryMetricColorRange,
  getMetricRampColor,
  type HistoryMetricKey,
} from '@/lib/history/metricColorScale'
import { downsampleTimeSeries, findNearestSampleIndexByTime } from '@/lib/history/playback'
import { useHistoryStore, type TelemetrySample } from '@/store/historyStore'
import { useSettingsStore } from '@/store/settingsStore'

interface HistoryTelemetryPanelProps {
  startAtMs: number | null
  endAtMs: number | null
  deviceName: string | null
  samples: TelemetrySample[]
  canPrevious: boolean
  canNext: boolean
  mediaEnabled: boolean
  mediaLoading: boolean
  mediaCount: number
  onPrevious: () => void
  onNext: () => void
  onOpenList: () => void
  onToggleMedia: () => void
  onSeek?: (timeMs: number) => void
  onMetricInteraction?: (metric: HistoryMetricKey) => void
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

function formatRideTitle(startAtMs: number | null, endAtMs: number | null): string {
  if (startAtMs == null || endAtMs == null) return ''
  return formatRideTime(startAtMs, endAtMs)
}

function formatRideMeta(
  startAtMs: number | null,
  endAtMs: number | null,
  deviceName: string | null,
): string {
  if (startAtMs == null || endAtMs == null) return deviceName ?? ''
  return deviceName
    ? `${formatRideDate(startAtMs, endAtMs)} · ${deviceName}`
    : formatRideDate(startAtMs, endAtMs)
}

export function HistoryTelemetryPanel({
  startAtMs,
  endAtMs,
  deviceName,
  samples,
  canPrevious,
  canNext,
  mediaEnabled,
  mediaLoading,
  mediaCount,
  onPrevious,
  onNext,
  onOpenList,
  onToggleMedia,
  onSeek,
  onMetricInteraction,
  onHeightChange,
}: HistoryTelemetryPanelProps) {
  const insets = useSafeAreaInsets()
  const [headTimeMs, setHeadTimeMs] = useState<number | null>(null)
  const [activeCharts, setActiveCharts] = useState<Set<OptionalChartMetric>>(new Set())
  const [shareInfoVisible, setShareInfoVisible] = useState(false)
  const pendingSelectionRef = useRef<TelemetryChartPoint | null>(null)
  const selectionFrameRef = useRef<number | null>(null)

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
  const dutyRange = useMemo(
    () =>
      computeAutoRange(dutyPoints, {
        includeZero: true,
        minSpan: 20,
        paddingRatio: 0.1,
        fallbackMin: 0,
        fallbackMax: 100,
      }),
    [dutyPoints],
  )
  const batteryVoltagePoints = useMemo<TelemetryChartPoint[]>(
    () => chartSamples.map((s) => ({ date: new Date(s.capturedAtMs), value: s.batteryVoltage })),
    [chartSamples],
  )
  const batteryPercentPoints = useMemo<TelemetryChartPoint[]>(
    () =>
      chartSamples
        .filter((s) => s.batteryPercent != null)
        .map((s) => ({ date: new Date(s.capturedAtMs), value: s.batteryPercent! })),
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
  const gradientsEnabled = useSettingsStore((s) => s.historyMetricGradientsEnabled)
  const hotRanges = useSettingsStore((s) => s.historyMetricHotRanges)
  const speedColorRange = useMemo(
    () => getHistoryMetricColorRange('speed', telemetry.speed.color, hotRanges, gradientsEnabled),
    [gradientsEnabled, hotRanges],
  )
  const speedPointColor = useMemo(
    () =>
      speedColorRange ? (value: number) => getMetricRampColor(value, speedColorRange) : undefined,
    [speedColorRange],
  )
  const metricColorRanges = useMemo(
    () => ({
      duty: getHistoryMetricColorRange('duty', telemetry.duty.color, hotRanges, gradientsEnabled),
      battery: getHistoryMetricColorRange(
        'battery',
        telemetry.battVoltage.color,
        hotRanges,
        gradientsEnabled,
      ),
      tempMotor: getHistoryMetricColorRange(
        'tempMotor',
        telemetry.motorTemp.color,
        hotRanges,
        gradientsEnabled,
      ),
      tempController: getHistoryMetricColorRange(
        'tempController',
        telemetry.controllerTemp.color,
        hotRanges,
        gradientsEnabled,
      ),
      motorCurrent: getHistoryMetricColorRange(
        'motorCurrent',
        telemetry.motorCurrent.color,
        hotRanges,
        gradientsEnabled,
      ),
      batteryCurrent: getHistoryMetricColorRange(
        'batteryCurrent',
        telemetry.battCurrent.color,
        hotRanges,
        gradientsEnabled,
      ),
    }),
    [gradientsEnabled, hotRanges],
  )
  const metricPointColors = useMemo(
    () => ({
      duty: metricColorRanges.duty
        ? (value: number) => getMetricRampColor(value, metricColorRanges.duty)
        : undefined,
      battery: metricColorRanges.battery
        ? (value: number) => getMetricRampColor(value, metricColorRanges.battery)
        : undefined,
      tempMotor: metricColorRanges.tempMotor
        ? (value: number) => getMetricRampColor(value, metricColorRanges.tempMotor)
        : undefined,
      tempController: metricColorRanges.tempController
        ? (value: number) => getMetricRampColor(value, metricColorRanges.tempController)
        : undefined,
      motorCurrent: metricColorRanges.motorCurrent
        ? (value: number) => getMetricRampColor(value, metricColorRanges.motorCurrent)
        : undefined,
      batteryCurrent: metricColorRanges.batteryCurrent
        ? (value: number) => getMetricRampColor(value, metricColorRanges.batteryCurrent)
        : undefined,
    }),
    [metricColorRanges],
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

  useEffect(
    () => () => {
      if (selectionFrameRef.current != null) cancelAnimationFrame(selectionFrameRef.current)
    },
    [],
  )

  const flushPendingSelection = useCallback(() => {
    selectionFrameRef.current = null
    const point = pendingSelectionRef.current
    if (!point) return
    pendingSelectionRef.current = null
    const ms = point.date.getTime()
    setHeadTimeMs(ms)
    onSeek?.(ms)
  }, [onSeek])

  const handlePointSelected = useCallback(
    (metric: HistoryMetricKey, point: TelemetryChartPoint) => {
      onMetricInteraction?.(metric)
      pendingSelectionRef.current = point
      if (selectionFrameRef.current != null) return
      selectionFrameRef.current = requestAnimationFrame(flushPendingSelection)
    },
    [flushPendingSelection, onMetricInteraction],
  )

  const headPoint: TelemetryChartPoint | null = headSample
    ? { date: new Date(headSample.capturedAtMs), value: headSample.speedKmh }
    : null

  const optionalChartConfig = headSample
    ? ({
        duty: {
          points: dutyPoints,
          range: dutyRange,
          label: telemetry.duty.label,
          value: fmtDutyPercent(headSample.dutyCycle, false),
          headValue: dutyPercent(headSample.dutyCycle, false),
          color: telemetry.duty.color,
          getPointColor: metricPointColors.duty,
          formatValue: (v: number) => `${v.toFixed(1)}%`,
          excludedRanges: dutyExcludedRanges,
        },
        battery:
          batteryPercentPoints.length > 0
            ? {
                // % is the main green line; voltage rides under it as dim gray.
                points: batteryPercentPoints,
                range: { y: { min: 0, max: 100 } },
                label: 'Battery',
                value:
                  headSample.batteryPercent != null
                    ? `${Math.round(headSample.batteryPercent)}%`
                    : '-',
                headValue: headSample.batteryPercent ?? 0,
                color: telemetry.battVoltage.color,
                getPointColor: undefined,
                formatValue: (v: number) => `${Math.round(v)}%`,
                secondary: {
                  points: batteryVoltagePoints,
                  range: batteryRange,
                  color: theme.neutral.textMuted,
                  value: telemetry.battVoltage.formatWithUnit(headSample.batteryVoltage),
                },
              }
            : {
                // No derived % for this ride (no pack config) — fall back to voltage only.
                points: batteryVoltagePoints,
                range: batteryRange,
                label: 'Battery',
                value: telemetry.battVoltage.formatWithUnit(headSample.batteryVoltage),
                headValue: headSample.batteryVoltage,
                color: telemetry.battVoltage.color,
                getPointColor: metricPointColors.battery,
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
          getPointColor: metricPointColors.tempMotor,
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
          getPointColor: metricPointColors.tempController,
          formatValue: (v: number) => telemetry.controllerTemp.formatWithUnit(v),
        },
        motorCurrent: {
          points: motorCurrentPoints,
          range: motorCurrentRange,
          label: telemetry.motorCurrent.label,
          value: telemetry.motorCurrent.formatWithUnit(headSample.motorCurrent),
          headValue: headSample.motorCurrent,
          color: telemetry.motorCurrent.color,
          getPointColor: metricPointColors.motorCurrent,
          formatValue: (v: number) => telemetry.motorCurrent.formatWithUnit(v),
        },
        batteryCurrent: {
          points: batteryCurrentPoints,
          range: batteryCurrentRange,
          label: telemetry.battCurrent.label,
          value: telemetry.battCurrent.formatWithUnit(headSample.batteryCurrent),
          headValue: headSample.batteryCurrent,
          color: telemetry.battCurrent.color,
          getPointColor: metricPointColors.batteryCurrent,
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
          getPointColor: ((value: number) => string) | undefined
          formatValue: (v: number) => string
          excludedRanges?: ExcludedRange[]
          secondary?: SecondaryChartSeries
        }
      >)
    : null

  return (
    <View
      style={[styles.panel, { bottom: bottomInset }]}
      onLayout={(e) => onHeightChange?.(e.nativeEvent.layout.height)}
    >
      <View style={styles.navControls}>
        <View style={styles.navSide}>
          <IconButton
            icon={ImagesSquareIcon}
            onPress={onToggleMedia}
            loading={mediaLoading}
            size="lg"
            style={mediaEnabled ? styles.mediaEnabled : undefined}
          />
          {mediaCount > 0 ? (
            <View style={styles.mediaCountBadge} pointerEvents="none">
              <Text style={styles.mediaCountText}>{mediaCount > 99 ? '99+' : mediaCount}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.navRow}>
          <Pressable
            style={({ pressed }) => [
              styles.navSegment,
              !canPrevious && styles.navSegmentDisabled,
              pressed && canPrevious && styles.navSegmentPressed,
            ]}
            android_ripple={interaction.ripple}
            onPress={onPrevious}
            disabled={!canPrevious}
          >
            <CaretLeftIcon size={22} color={theme.neutral.textSecondary} weight="bold" />
          </Pressable>
          <View style={styles.navDivider} />
          <Pressable
            style={({ pressed }) => [styles.titleButton, pressed && styles.navSegmentPressed]}
            android_ripple={interaction.ripple}
            onPress={onOpenList}
          >
            <View style={styles.titleContent}>
              <Text style={styles.titleTime} numberOfLines={1}>
                {formatRideTitle(startAtMs, endAtMs)}
              </Text>
              <Text style={styles.titleMeta} numberOfLines={1}>
                {formatRideMeta(startAtMs, endAtMs, deviceName)}
              </Text>
            </View>
            <CaretDownIcon size={12} color={theme.neutral.textSecondary} weight="bold" />
          </Pressable>
          <View style={styles.navDivider} />
          <Pressable
            style={({ pressed }) => [
              styles.navSegment,
              !canNext && styles.navSegmentDisabled,
              pressed && canNext && styles.navSegmentPressed,
            ]}
            android_ripple={interaction.ripple}
            onPress={onNext}
            disabled={!canNext}
          >
            <CaretRightIcon size={22} color={theme.neutral.textSecondary} weight="bold" />
          </Pressable>
        </View>
        <View style={styles.navSide}>
          <IconButton icon={CloudArrowUpIcon} onPress={() => setShareInfoVisible(true)} size="lg" />
        </View>
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
            getPointColor={speedPointColor}
            onGestureStart={() => onMetricInteraction?.('speed')}
            onPointSelected={(point) => handlePointSelected('speed', point)}
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
                getPointColor={cfg.getPointColor}
                onGestureStart={() => onMetricInteraction?.(metric.key)}
                onPointSelected={(point) => handlePointSelected(metric.key, point)}
                excludedRanges={
                  'excludedRanges' in cfg
                    ? (cfg.excludedRanges as ExcludedRange[] | undefined)
                    : undefined
                }
                secondary={'secondary' in cfg ? cfg.secondary : undefined}
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
                  onPress={() => {
                    onMetricInteraction?.(metric.key)
                    setActiveCharts((prev) => toggleOptionalChartMetric(prev, metric.key))
                  }}
                >
                  <View
                    style={[
                      styles.metricTabLine,
                      { backgroundColor: active ? cfg.color : theme.neutral.surface },
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
              <View
                style={[styles.metricLegendLine, { backgroundColor: theme.neutral.textSecondary }]}
              />
              <Text style={styles.metricLegendText} numberOfLines={1}>
                Low speed
              </Text>
            </View>
            <View style={styles.metricLegendItem}>
              <View style={[styles.metricLegendLine, { backgroundColor: theme.highlight.color }]} />
              <Text style={styles.metricLegendText} numberOfLines={1}>
                Free spin
              </Text>
            </View>
          </View>
        </>
      )}
      <InfoModal
        visible={shareInfoVisible}
        title="Share Ride"
        message="Ride sharing is coming in the future."
        onDismiss={() => setShareInfoVisible(false)}
      />
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
  navControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'center',
    width: '100%',
    gap: 8,
  },
  navSide: {
    width: 54,
    height: 54,
  },
  navRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 320,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    backgroundColor: theme.neutral.surfaceDeep,
    overflow: 'hidden',
  },
  mediaEnabled: {
    borderColor: theme.target.border,
    backgroundColor: theme.target.bg,
  },
  mediaCountBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.neutral.surfaceDeep,
    backgroundColor: theme.target.color,
  },
  mediaCountText: {
    color: theme.neutral.bg,
    fontSize: 9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  navSegment: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navSegmentDisabled: {
    opacity: 0.35,
  },
  navSegmentPressed: {
    opacity: 0.72,
  },
  navDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.neutral.border,
  },
  titleButton: {
    flex: 1,
    minWidth: 0,
    height: 54,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  titleContent: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  titleTime: {
    color: theme.neutral.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  titleMeta: {
    color: theme.neutral.textMuted,
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
    borderColor: theme.neutral.border,
    backgroundColor: theme.neutral.surfaceDeep,
    overflow: 'hidden',
  },
  metricTab: {
    width: `${100 / OPTIONAL_CHART_TAB_COUNT}%`,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.neutral.surfaceDeep,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 10,
  },
  metricTabDivider: {
    borderRightWidth: 1,
    borderRightColor: theme.neutral.border,
  },
  metricTabActive: {
    backgroundColor: theme.wheel.bg,
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
    color: theme.neutral.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    width: '100%',
    textAlign: 'center',
    lineHeight: 12,
  },
  metricTabTextActive: {
    color: theme.wheel.text,
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
    color: theme.neutral.textMuted,
    fontSize: 8,
    fontWeight: '600',
  },
  empty: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
  },
})
