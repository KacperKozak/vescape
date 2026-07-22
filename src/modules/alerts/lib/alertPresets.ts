import { TELEMETRY_THRESHOLDS } from '@/modules/board/constants/telemetryThresholds'

/**
 * Alert Presets — declarative per-metric intensity levels that expand into a set
 * of concrete Alert Rules.
 *
 * This is the pure, tested core the rest of the feature builds on: no UI, no
 * persistence, no native. A rider picks a {@link AlertPresetLevel} per metric and
 * {@link generateAlertPresetRules} deterministically maps `(metric, level, options)`
 * to {@link AlertRuleSpec}s. The store (provenance, ids, regeneration) finalizes
 * those specs — this module never persists.
 *
 * Two feedback families:
 * - **discrete** (battery, motor/controller temperature) → one single-threshold
 *   text-to-speech rule per configured point. Safer levels add more points and
 *   start earlier.
 * - **geiger** (speed, duty) → one range rule (`threshold` → `thresholdMax`) whose
 *   start drops with protection while the ceiling stays fixed.
 *
 * Values seed from the shared {@link TELEMETRY_THRESHOLDS} where sensible so the
 * presets track any future tuning of the visual warning tiers. Tune per-metric
 * counts/values here — never in native or in components.
 */

export type AlertPresetLevel = 'off' | 'safe' | 'normal' | 'pro'

export type AlertPresetMetric = 'battery' | 'speed' | 'duty' | 'motor-temp' | 'controller-temp'

/** Ordered intensity levels excluding `off`, safest first. */
export const ALERT_PRESET_ACTIVE_LEVELS = ['safe', 'normal', 'pro'] as const

type ActiveLevel = (typeof ALERT_PRESET_ACTIVE_LEVELS)[number]

/**
 * The generative slice of an {@link import('vescape-core').AlertRule} the generator
 * emits. `id`, `createdAt`, `enabled`, and `source` are the store's to finalize.
 */
export interface AlertRuleSpec {
  controlId: AlertPresetMetric
  threshold: number
  thresholdMax: number | null
  soundType: string
}

interface GeigerRange {
  /** Range start; a fraction of Rider Top Speed when `scaledByTopSpeed`, else absolute. */
  start: number
  /** Fixed range ceiling; same units as {@link start}. */
  ceiling: number
}

interface DiscreteMetricConfig {
  family: 'discrete'
  /** Text-to-speech template stored directly in `soundType` (JS-only presentation). */
  soundType: string
  /** Only battery today: no rules unless the board has a valid battery config. */
  requiresBatteryConfig?: boolean
  /** Ordered threshold points per level; count grows and starts earlier with protection. */
  levels: Record<ActiveLevel, number[]>
}

interface GeigerMetricConfig {
  family: 'geiger'
  /** Geiger tick preset for the range loop. */
  soundType: string
  /** Only speed today: {@link GeigerRange} values are fractions of Rider Top Speed. */
  scaledByTopSpeed?: boolean
  levels: Record<ActiveLevel, GeigerRange>
}

type AlertPresetMetricConfig = DiscreteMetricConfig | GeigerMetricConfig

const { battery, temp, duty } = TELEMETRY_THRESHOLDS
const batteryWarningPct = Math.round(battery.warning * 100)
const batteryCriticalPct = Math.round(battery.critical * 100)

/** Geiger tick preset shared by every range-based preset rule. */
export const ALERT_PRESET_GEIGER_SOUND_TYPE = 'preset:tick'

/**
 * Discrete temperature points reused by both temperature metrics — they share the
 * same tiers but generate as independent rule sets keyed by their own `controlId`.
 */
const TEMP_LEVELS: Record<ActiveLevel, number[]> = {
  safe: [55, 60, 65, temp.warning, 75, temp.critical],
  normal: [temp.warning, 75, temp.critical],
  pro: [temp.critical],
}

/**
 * Declarative safe/normal/pro definition for every preset metric. Battery points
 * are in percent (native compares battery single-threshold rules against SoC %
 * directly); temperatures in °C; duty in %; speed as a fraction of Rider Top Speed.
 */
export const ALERT_PRESET_LEVELS: Record<AlertPresetMetric, AlertPresetMetricConfig> = {
  battery: {
    family: 'discrete',
    soundType: 'tts:Battery {percent}%',
    requiresBatteryConfig: true,
    levels: {
      safe: [50, 40, batteryWarningPct, 20, 15, batteryCriticalPct, 5],
      normal: [batteryWarningPct, 20, batteryCriticalPct],
      pro: [15, 5],
    },
  },
  'motor-temp': {
    family: 'discrete',
    soundType: 'tts:Motor {value} {unit}',
    levels: TEMP_LEVELS,
  },
  'controller-temp': {
    family: 'discrete',
    soundType: 'tts:Controller {value} {unit}',
    levels: TEMP_LEVELS,
  },
  speed: {
    family: 'geiger',
    soundType: ALERT_PRESET_GEIGER_SOUND_TYPE,
    scaledByTopSpeed: true,
    levels: {
      safe: { start: 0.6, ceiling: 0.9 },
      normal: { start: 0.72, ceiling: 0.9 },
      pro: { start: 0.82, ceiling: 0.9 },
    },
  },
  duty: {
    family: 'geiger',
    soundType: ALERT_PRESET_GEIGER_SOUND_TYPE,
    levels: {
      safe: { start: 65, ceiling: duty.critical },
      normal: { start: duty.warning, ceiling: duty.critical },
      pro: { start: 88, ceiling: duty.critical },
    },
  },
}

export interface GenerateAlertPresetRulesOptions {
  /** Rider Top Speed in km/h; required to resolve speed thresholds. */
  riderTopSpeedKmh?: number | null
  /** Whether the active board has a valid battery config (battery presets need one). */
  hasBatteryConfig?: boolean
}

function isActiveLevel(level: AlertPresetLevel): level is ActiveLevel {
  return level !== 'off'
}

/**
 * Deterministically expand a preset selection into concrete rule specs.
 *
 * `off` — and any guard failure (battery without a valid config, speed without a
 * usable Rider Top Speed) — yields `[]` rather than garbage rules. Discrete metrics
 * emit one single-threshold rule per configured point in config order; geiger
 * metrics emit a single range rule.
 */
export function generateAlertPresetRules(
  metric: AlertPresetMetric,
  level: AlertPresetLevel,
  options: GenerateAlertPresetRulesOptions = {},
): AlertRuleSpec[] {
  if (!isActiveLevel(level)) return []

  const config = ALERT_PRESET_LEVELS[metric]

  if (config.family === 'discrete') {
    if (config.requiresBatteryConfig && !options.hasBatteryConfig) return []
    return config.levels[level].map((threshold) => ({
      controlId: metric,
      threshold,
      thresholdMax: null,
      soundType: config.soundType,
    }))
  }

  const range = config.levels[level]
  let { start, ceiling } = range
  if (config.scaledByTopSpeed) {
    const topSpeed = options.riderTopSpeedKmh
    if (typeof topSpeed !== 'number' || !Number.isFinite(topSpeed) || topSpeed <= 0) return []
    start = Math.round(start * topSpeed)
    ceiling = Math.round(ceiling * topSpeed)
  }

  return [
    {
      controlId: metric,
      threshold: start,
      thresholdMax: ceiling,
      soundType: config.soundType,
    },
  ]
}
