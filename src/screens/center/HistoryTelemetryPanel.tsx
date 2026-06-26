import { CaretDownIcon, ImagesSquareIcon, CloudArrowUpIcon } from 'phosphor-react-native'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'
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
import { PrevNextSelector } from '@/components/ui/controls/PrevNextSelector'
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
import { RIDE_TRIM_PADDING_MS, rideMovingWindow } from '@/lib/history/sessions'
import { useHistoryStore, type TelemetrySample } from '@/store/historyStore'
import { useSettingsStore } from '@/store/settingsStore'

interface HistoryTelemetryPanelProps {
  startAtMs: number | null
  endAtMs: number | null
  movingStartAtMs: number | null
  movingEndAtMs: number | null
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
const MAP_SEEK_THROTTLE_MS = 33

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
  movingStartAtMs,
  movingEndAtMs,
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
  const scrubTimeMs = useSharedValue<number | null>(null)
  const lastMapSeekAtRef = useRef(0)

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
  const rideWindow = rideMovingWindow({ movingStartAtMs, movingEndAtMs })
  const titleStartMs = rideWindow?.startMs ?? startAtMs
  const titleEndMs = rideWindow?.endMs ?? endAtMs
  const chartSamples = useMemo(
    () => downsampleTimeSeries(visibleSamples, CHART_MAX_POINTS, (sample) => sample.capturedAtMs),
    [visibleSamples],
  )

  const headSample = useMemo(() => {
    if (headTimeMs == null) return visibleSamples.at(-1) ?? null
    const idx = findNearestSampleIndexByTime(visibleSamples, headTimeMs)
    return idx >= 0 ? visibleSamples[idx] : (visibleSamples.at(-1) ?? null)
  }, [visibleSamples, headTimeMs])

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

  const hasChartData = headSample != null && visibleSamples.length >= 2

  const handleScrubTimeChange = useCallback(
    (timeMs: number) => {
      const now = Date.now()
      if (now - lastMapSeekAtRef.current < MAP_SEEK_THROTTLE_MS) return
      lastMapSeekAtRef.current = now
      onSeek?.(timeMs)
    },
    [onSeek],
  )

  const handlePointSelected = useCallback(
    (point: TelemetryChartPoint) => {
      const ms = point.date.getTime()
      setHeadTimeMs(ms)
      onSeek?.(ms)
    },
    [onSeek],
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
                  color: theme.palette.slate.textMuted,
                  value: telemetry.battVoltage.formatWithUnit(headSample.batteryVoltage),
                  formatValue: telemetry.battVoltage.formatWithUnit,
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
        <PrevNextSelector
          label={formatRideTitle(titleStartMs, titleEndMs)}
          previousDisabled={!canPrevious}
          nextDisabled={!canNext}
          onPrevious={onPrevious}
          onNext={onNext}
          style={styles.navSelector}
          selectControl={
            <Pressable
              style={({ pressed }) => [styles.titleButton, pressed && styles.titleButtonPressed]}
              android_ripple={interaction.ripple}
              onPress={onOpenList}
            >
              <View style={styles.titleContent}>
                <Text style={styles.titleTime} numberOfLines={1}>
                  {formatRideTitle(titleStartMs, titleEndMs)}
                </Text>
                <Text style={styles.titleMeta} numberOfLines={1}>
                  {formatRideMeta(titleStartMs, titleEndMs, deviceName)}
                </Text>
              </View>
              <CaretDownIcon size={12} color={theme.palette.slate.textSecondary} weight="bold" />
            </Pressable>
          }
        />
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
            onPointSelected={handlePointSelected}
            scrubTimeMs={scrubTimeMs}
            onScrubTimeChange={handleScrubTimeChange}
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
                onPointSelected={handlePointSelected}
                scrubTimeMs={scrubTimeMs}
                onScrubTimeChange={handleScrubTimeChange}
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
                      { backgroundColor: active ? cfg.color : theme.palette.slate.surface },
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
                style={[
                  styles.metricLegendLine,
                  { backgroundColor: theme.palette.slate.textSecondary },
                ]}
              />
              <Text style={styles.metricLegendText} numberOfLines={1}>
                Low speed
              </Text>
            </View>
            <View style={styles.metricLegendItem}>
              <View
                style={[styles.metricLegendLine, { backgroundColor: theme.palette.yellow.color }]}
              />
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
  navSelector: {
    flex: 1,
    minWidth: 0,
  },
  mediaEnabled: {
    borderColor: theme.palette.purple.border,
    backgroundColor: theme.palette.purple.bg,
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
    borderColor: theme.palette.slate.surfaceDeep,
    backgroundColor: theme.palette.purple.color,
  },
  mediaCountText: {
    color: theme.palette.slate.bg,
    fontSize: 9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  titleButtonPressed: {
    opacity: 0.72,
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
    color: theme.palette.slate.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  titleMeta: {
    color: theme.palette.slate.textMuted,
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
    borderColor: theme.palette.slate.border,
    backgroundColor: theme.palette.slate.surfaceDeep,
    overflow: 'hidden',
  },
  metricTab: {
    width: `${100 / OPTIONAL_CHART_TAB_COUNT}%`,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.slate.surfaceDeep,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 10,
  },
  metricTabDivider: {
    borderRightWidth: 1,
    borderRightColor: theme.palette.slate.border,
  },
  metricTabActive: {
    backgroundColor: theme.palette.sky.bg,
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
    color: theme.palette.slate.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    width: '100%',
    textAlign: 'center',
    lineHeight: 12,
  },
  metricTabTextActive: {
    color: theme.palette.sky.text,
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
    color: theme.palette.slate.textMuted,
    fontSize: 8,
    fontWeight: '600',
  },
  empty: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
  },
})
