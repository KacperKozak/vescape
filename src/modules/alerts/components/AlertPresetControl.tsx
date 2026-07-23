import { useEffect, useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import { Text } from '@/components/base/Text'
import { type DualGaugeAlert } from '@/components/charts/gaugeAlert'
import { SingleGauge } from '@/modules/board/components/DualGauge'
import { telemetry } from '@/modules/board/constants/telemetry'
import {
  ALERT_PRESET_ACTIVE_LEVELS,
  generateAlertPresetRules,
  type AlertPresetLevel,
  type AlertPresetMetric,
} from '@/modules/alerts/lib/alertPresets'
import { theme } from '@/constants/theme'

/**
 * The shared preset control: an Off/Safe/Normal/Pro level slider over an enlarged,
 * labeled gauge preview. The markers are derived straight from the pure generator
 * (`generateAlertPresetRules`), so the preview renders offline — no board, no
 * persisted rules required. When a live telemetry {@link SharedValue} is supplied
 * the needle + readout overlay the static markers.
 *
 * Presentational + controlled: it owns no store. Callers bind `level`/`onLevelChange`
 * to the Alert Preset store and pass `boardTopSpeedKmh`/`hasBatteryConfig` from
 * settings + the active board.
 */

interface PresetGaugeDescriptor {
  title: string
  color: string
  /** Readout unit shown under the live value. */
  unit: string
  decimals: number
  min: number
  /** Full-scale value; speed overrides this with Board Top Speed. */
  defaultMax: number
  /** Compact label drawn at a threshold marker (e.g. `20%`, `70°`, `38 km/h`). */
  formatMarker: (value: number) => string
}

const round = (value: number) => Math.round(value)

// JS-only presentation: colors, units, and label formatting the gauge preview draws.
// Battery is percent-scaled here (its thresholds are SoC %), unlike the voltage telemetry metric.
const PRESET_GAUGE: Record<AlertPresetMetric, PresetGaugeDescriptor> = {
  battery: {
    title: 'Battery',
    color: telemetry.battVoltage.color,
    unit: '%',
    decimals: 0,
    min: 0,
    defaultMax: 100,
    formatMarker: (v) => `${round(v)}%`,
  },
  speed: {
    title: 'Speed',
    color: telemetry.speed.color,
    unit: 'km/h',
    decimals: 0,
    min: 0,
    defaultMax: telemetry.speed.chartRange.max,
    formatMarker: (v) => `${round(v)} km/h`,
  },
  duty: {
    title: 'Duty',
    color: telemetry.duty.color,
    unit: '%',
    decimals: 0,
    min: 0,
    defaultMax: 100,
    formatMarker: (v) => `${round(v)}%`,
  },
  'motor-temp': {
    title: 'Motor Temp',
    color: telemetry.motorTemp.color,
    unit: '°C',
    decimals: 0,
    min: 0,
    defaultMax: telemetry.motorTemp.chartRange.max,
    formatMarker: (v) => `${round(v)}°`,
  },
  'controller-temp': {
    title: 'Controller Temp',
    color: telemetry.controllerTemp.color,
    unit: '°C',
    decimals: 0,
    min: 0,
    defaultMax: telemetry.controllerTemp.chartRange.max,
    formatMarker: (v) => `${round(v)}°`,
  },
}

/**
 * Structural mirror of the gauge hot-range span. Kept local so this alerts-module
 * component never imports the history module (no `alerts → history` edge); it is
 * assignable to {@link SingleGauge}'s `MetricHotRange` prop.
 */
interface PresetGaugeHotRange {
  start: number
  end: number
}

interface AlertPresetControlProps {
  metric: AlertPresetMetric
  level: AlertPresetLevel
  onLevelChange: (level: AlertPresetLevel) => void
  /** Live telemetry value; when supplied the gauge overlays a moving needle + readout. */
  liveValue?: SharedValue<number | null>
  /** Board Top Speed (km/h) — resolves speed thresholds and the speed gauge full-scale. */
  boardTopSpeedKmh?: number | null
  /** Whether the active board has a valid battery config (battery markers need one). */
  hasBatteryConfig?: boolean
  /** Custom (non-preset) alert markers layered onto the same gauge alongside the preset markers. */
  customAlerts?: DualGaugeAlert[]
  /** History hot-range gradient for the gauge arc (kept in sync with the detail gauge). */
  hotRange?: PresetGaugeHotRange | null
  /** Blocks slider interaction and dims it (e.g. battery without a valid config). */
  disabled?: boolean
}

export function AlertPresetControl({
  metric,
  level,
  onLevelChange,
  liveValue,
  boardTopSpeedKmh,
  hasBatteryConfig,
  customAlerts,
  hotRange,
  disabled,
}: AlertPresetControlProps) {
  const gauge = PRESET_GAUGE[metric]
  const max =
    metric === 'speed' && boardTopSpeedKmh && boardTopSpeedKmh > 0
      ? boardTopSpeedKmh
      : gauge.defaultMax

  const alerts = useMemo<DualGaugeAlert[]>(() => {
    const specs = generateAlertPresetRules(metric, level, {
      boardTopSpeedKmh,
      hasBatteryConfig,
    })
    // Preset markers come straight from the pure generator (instant + atomic as the slider
    // moves, no store round-trip flicker); custom markers layer on top from the caller.
    const presetMarkers = specs.map((spec, index) => ({
      id: `${metric}-${index}`,
      threshold: spec.threshold,
      thresholdMax: spec.thresholdMax,
      label: gauge.formatMarker(spec.threshold),
      labelMax: spec.thresholdMax == null ? undefined : gauge.formatMarker(spec.thresholdMax),
    }))
    return customAlerts ? [...presetMarkers, ...customAlerts] : presetMarkers
  }, [metric, level, boardTopSpeedKmh, hasBatteryConfig, gauge, customAlerts])

  // A stable null placeholder so the gauge always has a SharedValue; the needle is hidden offline.
  const placeholder = useSharedValue<number | null>(null)

  return (
    <View style={styles.container}>
      <SingleGauge
        value={liveValue ?? placeholder}
        min={gauge.min}
        max={max}
        color={gauge.color}
        unit={gauge.unit}
        decimals={gauge.decimals}
        label={gauge.title.toUpperCase()}
        alerts={alerts}
        hotRange={hotRange}
        showValue={liveValue != null}
        containerStyle={styles.gauge}
      />
      <LevelSlider value={level} onChange={onLevelChange} disabled={disabled} />
    </View>
  )
}

interface LevelTone {
  bg: string
  border: string
  color: string
}

const LEVEL_OPTIONS: { id: AlertPresetLevel; label: string; tone: LevelTone }[] = [
  {
    id: 'off',
    label: 'Off',
    tone: {
      bg: theme.palette.slate.surface,
      border: theme.palette.slate.border,
      color: theme.palette.slate.textSecondary,
    },
  },
  { id: 'safe', label: 'Safe', tone: theme.palette.green },
  { id: 'normal', label: 'Normal', tone: theme.palette.amber },
  { id: 'pro', label: 'Pro', tone: theme.palette.red },
]

const ALL_LEVELS: AlertPresetLevel[] = ['off', ...ALERT_PRESET_ACTIVE_LEVELS]
const SLIDER_ANIMATION = { duration: 180 } as const

interface LevelSliderProps {
  value: AlertPresetLevel
  onChange: (level: AlertPresetLevel) => void
  disabled?: boolean
}

function LevelSlider({ value, onChange, disabled }: LevelSliderProps) {
  const activeIndex = Math.max(0, ALL_LEVELS.indexOf(value))
  const tone = LEVEL_OPTIONS[activeIndex]!.tone
  const progress = useSharedValue(activeIndex)

  useEffect(() => {
    progress.value = withTiming(activeIndex, SLIDER_ANIMATION)
  }, [activeIndex, progress])

  const highlightStyle = useAnimatedStyle(
    () => ({
      left: `${(progress.value / LEVEL_OPTIONS.length) * 100}%`,
      backgroundColor: tone.bg,
      borderColor: tone.border,
    }),
    [tone.bg, tone.border],
  )

  return (
    <View style={[styles.slider, disabled && styles.sliderDisabled]}>
      <Animated.View style={[styles.sliderHighlight, highlightStyle]} />
      {LEVEL_OPTIONS.map((option) => {
        const active = option.id === value
        return (
          <Pressable
            key={option.id}
            style={styles.sliderSegment}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={option.label}
            disabled={disabled}
            onPress={() => onChange(option.id)}
          >
            <Text
              style={[
                styles.sliderLabel,
                { color: active ? option.tone.color : theme.palette.slate.textMuted },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  gauge: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  slider: {
    flexDirection: 'row',
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.palette.slate.surfaceDeep,
    position: 'relative',
    overflow: 'hidden',
  },
  sliderDisabled: {
    opacity: 0.45,
  },
  sliderHighlight: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    width: `${100 / LEVEL_OPTIONS.length}%`,
    borderRadius: 16,
    borderWidth: 1,
  },
  sliderSegment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
})
