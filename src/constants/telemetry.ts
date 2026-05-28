import { theme } from '@/constants/theme'
type TelemetryChartRange = { min: number; max: number }

export interface TelemetryMetricConfig {
  label: string
  unit: string
  color: string
  decimals: number
  chartRange: TelemetryChartRange
  /** Sparkline auto-range min span. Omit for fixed-range metrics. */
  minSpan?: number
  /** Alert system controlId (kebab-case). Omit if metric has no alert support. */
  controlId?: string
  /** Format a numeric value (no unit suffix). */
  format: (value: number) => string
  /** Format a numeric value with unit suffix. */
  formatWithUnit: (value: number) => string
}

type TelemetryMetricDefinition = Omit<TelemetryMetricConfig, 'format' | 'formatWithUnit'> & {
  /** Display absolute values for this metric. */
  abs?: boolean
  /** Remove the separator between number and unit in formatWithUnit. */
  compactUnit?: boolean
}

type TelemetryDefinitions = Record<string, TelemetryMetricDefinition>

function defineMetric(config: TelemetryMetricDefinition): TelemetryMetricConfig {
  const abs = config.abs ?? false
  const formatNumber = (value: number) => {
    const val = abs ? Math.abs(value) : value
    return config.decimals === 0 ? Math.round(val).toString() : val.toFixed(config.decimals)
  }

  return {
    label: config.label,
    unit: config.unit,
    color: config.color,
    decimals: config.decimals,
    chartRange: config.chartRange,
    minSpan: config.minSpan,
    controlId: config.controlId,
    format: formatNumber,
    formatWithUnit: (v: number) => {
      const num = formatNumber(v)
      if (!config.unit) return num
      return config.compactUnit ? `${num}${config.unit}` : `${num} ${config.unit}`
    },
  }
}

function defineTelemetry<const T extends TelemetryDefinitions>(
  definitions: T,
): { readonly [K in keyof T]: TelemetryMetricConfig } {
  return Object.fromEntries(
    Object.entries(definitions).map(([key, definition]) => [key, defineMetric(definition)]),
  ) as { readonly [K in keyof T]: TelemetryMetricConfig }
}

const telemetryDefinitions = {
  speed: {
    label: 'Speed',
    unit: 'km/h',
    color: theme.wheel.color,
    decimals: 0,
    chartRange: { min: 0, max: 50 },
    controlId: 'speed',
    abs: true,
  },
  duty: {
    label: 'Duty Cycle',
    unit: '%',
    color: theme.teal.color,
    decimals: 0,
    chartRange: { min: 0, max: 100 },
    controlId: 'duty',
  },
  motorCurrent: {
    label: 'Motor Current',
    unit: 'A',
    color: '#818cf8',
    decimals: 0,
    chartRange: { min: -30, max: 30 },
    minSpan: 20,
    controlId: 'motor-current',
  },
  battCurrent: {
    label: 'Batt Current',
    unit: 'A',
    color: '#60a5fa',
    decimals: 0,
    chartRange: { min: -30, max: 30 },
    minSpan: 20,
    controlId: 'batt-current',
  },
  battVoltage: {
    label: 'Battery Voltage',
    unit: 'V',
    color: '#4ade80',
    decimals: 1,
    compactUnit: true,
    chartRange: { min: 0, max: 100 },
    minSpan: 2,
    controlId: 'battery',
  },
  motorTemp: {
    label: 'Motor Temp',
    unit: '°C',
    color: theme.warning.color,
    decimals: 0,
    chartRange: { min: 0, max: 80 },
    minSpan: 30,
    controlId: 'motor-temp',
  },
  controllerTemp: {
    label: 'Controller Temp',
    unit: '°C',
    color: theme.error.color,
    decimals: 0,
    chartRange: { min: 0, max: 80 },
    minSpan: 30,
    controlId: 'controller-temp',
  },
  footpadAdc1: {
    label: 'ADC 1',
    unit: '',
    color: theme.neutral.textSecondary,
    decimals: 3,
    chartRange: { min: 0, max: 3.3 },
    minSpan: 0.5,
  },
  footpadAdc2: {
    label: 'ADC 2',
    unit: '',
    color: theme.neutral.textMuted,
    decimals: 3,
    chartRange: { min: 0, max: 3.3 },
    minSpan: 0.5,
  },
  pitch: {
    label: 'Pitch',
    unit: '°',
    color: '#a78bfa',
    decimals: 1,
    chartRange: { min: -15, max: 15 },
    minSpan: 20,
  },
  roll: {
    label: 'Roll',
    unit: '°',
    color: '#c084fc',
    decimals: 1,
    chartRange: { min: -15, max: 15 },
    minSpan: 20,
  },
  balancePitch: {
    label: 'Balance Pitch',
    unit: '°',
    color: '#e879f9',
    decimals: 1,
    chartRange: { min: -15, max: 15 },
    minSpan: 20,
  },
} satisfies TelemetryDefinitions

export const telemetry = defineTelemetry(telemetryDefinitions)

export const telemetryByControlId = Object.fromEntries(
  Object.values(telemetry)
    .filter((metric) => metric.controlId != null)
    .map((metric) => [metric.controlId, metric]),
) as Record<string, TelemetryMetricConfig>
