# Telemetry Registry — Unified Config

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a single telemetry registry that owns every metric's label, unit, color, formatting, and chart range — used everywhere (dashboard cards, control screens, history).

**Architecture:** One `telemetry` const object in `src/constants/telemetry.ts` maps each metric key to its config. All screens/components import from it instead of hardcoding colors, labels, units, and format functions. `chartDefaults.ts` gets deleted (absorbed). Per-metric format functions in `format.ts` get deleted (absorbed). `CONTROL_UNITS` in `TelemetryCard.tsx` gets deleted (absorbed).

**Tech Stack:** TypeScript, React Native

---

### Color Decisions

Using history screen colors as canonical (user preference). Notable changes from current live views:

| Metric | Old Live Color | New Unified Color |
|--------|---------------|-------------------|
| speed | #38bdf8 (sky-400) | #38bdf8 (unchanged) |
| duty | #06b6d4 (cyan-500) | #34d399 (emerald-400) |
| battVoltage | #22c55e (green-500) | #fbbf24 (amber-400) |
| motorTemp | #f97316 (orange-500) | #f97316 (unchanged) |
| controllerTemp | #f97316 (orange-500) | #ef4444 (red-500) |
| motorCurrent | #06b6d4 (cyan-500) | #22c55e (green-500) |
| battCurrent | #22c55e (green-500) | #06b6d4 (cyan-500) |
| footpadAdc1 | #38bdf8 | #38bdf8 (unchanged) |
| footpadAdc2 | #06b6d4 | #06b6d4 (unchanged) |
| pitch | #38bdf8 | #38bdf8 (unchanged) |
| roll | #06b6d4 | #06b6d4 (unchanged) |
| balancePitch | #a855f7 | #a855f7 (unchanged) |

> Note: battCurrent uses #06b6d4 (cyan) instead of history's #38bdf8 to avoid collision with speed. Both are "cool blue" family.

---

### Task 1: Create the Telemetry Registry

**Files:**
- Create: `src/constants/telemetry.ts`

- [ ] **Step 1: Create `src/constants/telemetry.ts`**

```ts
export interface TelemetryMetricConfig {
  label: string
  unit: string
  color: string
  decimals: number
  chartRange: { min: number; max: number }
  /** Sparkline auto-range min span. Omit for fixed-range metrics. */
  minSpan?: number
  /** Alert system controlId (kebab-case). Omit if metric has no alert support. */
  controlId?: string
  /** Format a numeric value (no unit suffix). */
  format: (value: number) => string
  /** Format a numeric value with unit suffix. */
  formatWithUnit: (value: number) => string
}

function metric(
  label: string,
  unit: string,
  color: string,
  decimals: number,
  chartRange: { min: number; max: number },
  opts?: { minSpan?: number; controlId?: string; abs?: boolean },
): TelemetryMetricConfig {
  const abs = opts?.abs ?? false
  return {
    label,
    unit,
    color,
    decimals,
    chartRange,
    minSpan: opts?.minSpan,
    controlId: opts?.controlId,
    format: (v: number) => {
      const val = abs ? Math.abs(v) : v
      return decimals === 0 ? Math.round(val).toString() : val.toFixed(decimals)
    },
    formatWithUnit: (v: number) => {
      const val = abs ? Math.abs(v) : v
      const num = decimals === 0 ? Math.round(val).toString() : val.toFixed(decimals)
      return `${num} ${unit}`
    },
  }
}

export const telemetry = {
  speed: metric('Speed', 'km/h', '#38bdf8', 0, { min: 0, max: 50 }, { controlId: 'speed', abs: true }),
  duty: metric('Duty Cycle', '%', '#34d399', 0, { min: 0, max: 100 }, { controlId: 'duty' }),
  motorCurrent: metric('Motor Current', 'A', '#22c55e', 0, { min: -30, max: 30 }, { minSpan: 20, controlId: 'motor-current' }),
  battCurrent: metric('Batt Current', 'A', '#06b6d4', 0, { min: -30, max: 30 }, { minSpan: 20, controlId: 'batt-current' }),
  battVoltage: metric('Battery Voltage', 'V', '#fbbf24', 2, { min: 0, max: 100 }, { minSpan: 2, controlId: 'battery' }),
  motorTemp: metric('Motor Temp', '°C', '#f97316', 0, { min: 0, max: 80 }, { minSpan: 30, controlId: 'motor-temp' }),
  controllerTemp: metric('Controller Temp', '°C', '#ef4444', 0, { min: 0, max: 80 }, { minSpan: 30, controlId: 'controller-temp' }),
  footpadAdc1: metric('ADC 1', '', '#38bdf8', 3, { min: 0, max: 3.3 }, { minSpan: 0.5 }),
  footpadAdc2: metric('ADC 2', '', '#06b6d4', 3, { min: 0, max: 3.3 }, { minSpan: 0.5 }),
  pitch: metric('Pitch', '°', '#38bdf8', 1, { min: -15, max: 15 }, { minSpan: 20 }),
  roll: metric('Roll', '°', '#06b6d4', 1, { min: -15, max: 15 }, { minSpan: 20 }),
  balancePitch: metric('Balance Pitch', '°', '#a855f7', 1, { min: -15, max: 15 }, { minSpan: 20 }),
} as const

export type TelemetryMetricKey = keyof typeof telemetry
```

- [ ] **Step 2: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/constants/telemetry.ts
git commit -m "feat: add centralized telemetry registry"
```

---

### Task 2: Update Dashboard Cards

**Files:**
- Modify: `src/components/cards/DutyCard.tsx`
- Modify: `src/components/cards/MotorCurrentCard.tsx`
- Modify: `src/components/cards/BattCurrentCard.tsx`
- Modify: `src/components/cards/MotorTempCard.tsx`
- Modify: `src/components/cards/ControllerTempCard.tsx`

Each card currently hardcodes: `label`, `unit`, `seriesColor`, `controlId`, `FMT_MAX`, `MIN_SPAN`/`RANGE`.
Replace all with registry lookups.

- [ ] **Step 1: Update DutyCard.tsx**

Replace `theme` import with `telemetry` import. Replace hardcoded values:

```tsx
import { TelemetryCard } from '@/components/TelemetryCard'
import { telemetry } from '@/constants/telemetry'
import { DASH } from '@/helpers/format'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const cfg = telemetry.duty
const FMT_MAX = (v: number) => cfg.formatWithUnit(v)
const RANGE = cfg.chartRange

export function DutyCard() {
  const series = useLiveMetric(liveSelectors.duty)
  const windowMs = useLiveWindowMs()

  return (
    <TelemetryCard
      controlId={cfg.controlId}
      label={cfg.label}
      value={DASH}
      unit={cfg.unit}
      animatedValue={liveTelemetryRuntime.values.dutyPercent}
      animatedDecimals={cfg.decimals}
      series={series}
      seriesColor={cfg.color}
      fmtMax={FMT_MAX}
      range={RANGE}
      windowMs={windowMs}
    />
  )
}
```

- [ ] **Step 2: Update MotorCurrentCard.tsx**

Same pattern — replace theme + hardcoded label/unit/color with `telemetry.motorCurrent`:

```tsx
import { TelemetryCard } from '@/components/TelemetryCard'
import { telemetry } from '@/constants/telemetry'
import { DASH } from '@/helpers/format'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const cfg = telemetry.motorCurrent
const FMT_MAX = (v: number) => cfg.formatWithUnit(v)

export function MotorCurrentCard() {
  const series = useLiveMetric(liveSelectors.motorCurrent)
  const windowMs = useLiveWindowMs()

  return (
    <TelemetryCard
      controlId={cfg.controlId}
      label={cfg.label}
      value={DASH}
      unit={cfg.unit}
      animatedValue={liveTelemetryRuntime.values.motorCurrent}
      animatedDecimals={cfg.decimals}
      series={series}
      seriesColor={cfg.color}
      fmtMax={FMT_MAX}
      minSpan={cfg.minSpan}
      windowMs={windowMs}
    />
  )
}
```

- [ ] **Step 3: Update BattCurrentCard.tsx**

Same pattern with `telemetry.battCurrent`:

```tsx
import { TelemetryCard } from '@/components/TelemetryCard'
import { telemetry } from '@/constants/telemetry'
import { DASH } from '@/helpers/format'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const cfg = telemetry.battCurrent
const FMT_MAX = (v: number) => cfg.formatWithUnit(v)

export function BattCurrentCard() {
  const series = useLiveMetric(liveSelectors.batteryCurrent)
  const windowMs = useLiveWindowMs()

  return (
    <TelemetryCard
      controlId={cfg.controlId}
      label={cfg.label}
      value={DASH}
      unit={cfg.unit}
      animatedValue={liveTelemetryRuntime.values.batteryCurrent}
      animatedDecimals={cfg.decimals}
      series={series}
      seriesColor={cfg.color}
      fmtMax={FMT_MAX}
      minSpan={cfg.minSpan}
      windowMs={windowMs}
    />
  )
}
```

- [ ] **Step 4: Update MotorTempCard.tsx**

Same pattern with `telemetry.motorTemp`:

```tsx
import { TelemetryCard } from '@/components/TelemetryCard'
import { telemetry } from '@/constants/telemetry'
import { DASH } from '@/helpers/format'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const cfg = telemetry.motorTemp
const FMT_MAX = (v: number) => cfg.formatWithUnit(v)

export function MotorTempCard() {
  const series = useLiveMetric(liveSelectors.motorTemp)
  const windowMs = useLiveWindowMs()

  return (
    <TelemetryCard
      controlId={cfg.controlId}
      label={cfg.label}
      value={DASH}
      unit={cfg.unit}
      animatedValue={liveTelemetryRuntime.values.motorTemp}
      animatedDecimals={cfg.decimals}
      series={series}
      seriesColor={cfg.color}
      fmtMax={FMT_MAX}
      minSpan={cfg.minSpan}
      windowMs={windowMs}
    />
  )
}
```

- [ ] **Step 5: Update ControllerTempCard.tsx**

Same pattern with `telemetry.controllerTemp`:

```tsx
import { TelemetryCard } from '@/components/TelemetryCard'
import { telemetry } from '@/constants/telemetry'
import { DASH } from '@/helpers/format'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const cfg = telemetry.controllerTemp
const FMT_MAX = (v: number) => cfg.formatWithUnit(v)

export function ControllerTempCard() {
  const series = useLiveMetric(liveSelectors.controllerTemp)
  const windowMs = useLiveWindowMs()

  return (
    <TelemetryCard
      controlId={cfg.controlId}
      label={cfg.label}
      value={DASH}
      unit={cfg.unit}
      animatedValue={liveTelemetryRuntime.values.controllerTemp}
      animatedDecimals={cfg.decimals}
      series={series}
      seriesColor={cfg.color}
      fmtMax={FMT_MAX}
      minSpan={cfg.minSpan}
      windowMs={windowMs}
    />
  )
}
```

- [ ] **Step 6: Verify it compiles**

Run: `bunx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src/components/cards/DutyCard.tsx src/components/cards/MotorCurrentCard.tsx src/components/cards/BattCurrentCard.tsx src/components/cards/MotorTempCard.tsx src/components/cards/ControllerTempCard.tsx
git commit -m "refactor: dashboard cards use telemetry registry"
```

---

### Task 3: Update Footpad and IMU Cards

**Files:**
- Modify: `src/components/cards/FootpadCard.tsx`
- Modify: `src/components/cards/ImuCard.tsx`

These are multi-metric cards with custom layouts. Replace color and format references.

- [ ] **Step 1: Update FootpadCard.tsx**

Replace `theme.wheel.color` with `telemetry.footpadAdc1.color`, `theme.bran.color` with `telemetry.footpadAdc2.color`. Replace inline `.toFixed(2)` with `telemetry.footpadAdc1.format(v)`:

```tsx
import { StyleSheet, Text, View } from 'react-native'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { telemetry } from '@/constants/telemetry'
import { DASH } from '@/helpers/format'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const adc1 = telemetry.footpadAdc1
const adc2 = telemetry.footpadAdc2

export function FootpadCard() {
  const adc1Series = useLiveMetric(liveSelectors.footpadAdc1)
  const adc2Series = useLiveMetric(liveSelectors.footpadAdc2)
  const windowMs = useLiveWindowMs()
  const latestAdc1 = adc1Series.at(-1)
  const latestAdc2 = adc2Series.at(-1)

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Footpad</Text>
      <View style={styles.row}>
        <AdcColumn
          label={adc1.label}
          value={latestAdc1 ? adc1.format(latestAdc1.value) : DASH}
          series={adc1Series}
          color={adc1.color}
          windowMs={windowMs}
        />
        <View style={styles.divider} />
        <AdcColumn
          label={adc2.label}
          value={latestAdc2 ? adc2.format(latestAdc2.value) : DASH}
          series={adc2Series}
          color={adc2.color}
          windowMs={windowMs}
        />
      </View>
    </View>
  )
}
```

Keep the `AdcColumn` component and styles unchanged.

- [ ] **Step 2: Update ImuCard.tsx**

Replace `theme.wheel.color`/`theme.bran.color`/`theme.target.color` with `telemetry.pitch.color`/`telemetry.roll.color`/`telemetry.balancePitch.color`. Replace `fmt(v, 0)` with registry format:

```tsx
import { StyleSheet, Text, View } from 'react-native'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { telemetry } from '@/constants/telemetry'
import { DASH } from '@/helpers/format'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const pitchCfg = telemetry.pitch
const rollCfg = telemetry.roll
const balanceCfg = telemetry.balancePitch

export function ImuCard() {
  const pitchSeries = useLiveMetric(liveSelectors.pitch)
  const rollSeries = useLiveMetric(liveSelectors.roll)
  const balanceSeries = useLiveMetric(liveSelectors.balancePitch)
  const windowMs = useLiveWindowMs()
  const latestPitch = pitchSeries.at(-1)
  const latestRoll = rollSeries.at(-1)
  const latestBalance = balanceSeries.at(-1)

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>IMU</Text>
      <View style={styles.row}>
        <ImuColumn
          label="P"
          value={latestPitch ? pitchCfg.formatWithUnit(latestPitch.value) : DASH}
          series={pitchSeries}
          color={pitchCfg.color}
          windowMs={windowMs}
        />
        <View style={styles.divider} />
        <ImuColumn
          label="R"
          value={latestRoll ? rollCfg.formatWithUnit(latestRoll.value) : DASH}
          series={rollSeries}
          color={rollCfg.color}
          windowMs={windowMs}
        />
        <View style={styles.divider} />
        <ImuColumn
          label="B"
          value={latestBalance ? balanceCfg.formatWithUnit(latestBalance.value) : DASH}
          series={balanceSeries}
          color={balanceCfg.color}
          windowMs={windowMs}
        />
      </View>
    </View>
  )
}
```

Keep `ImuColumn` and styles unchanged.

- [ ] **Step 3: Verify it compiles**

Run: `bunx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/cards/FootpadCard.tsx src/components/cards/ImuCard.tsx
git commit -m "refactor: footpad and IMU cards use telemetry registry"
```

---

### Task 4: Update SpeedGauge and BatteryBar

**Files:**
- Modify: `src/components/charts/SpeedGauge.tsx`
- Modify: `src/components/BatteryBar.tsx`

- [ ] **Step 1: Update SpeedGauge.tsx**

Replace `theme.wheel.color` on line 104 and `fmtSpeed` import with registry:

```tsx
// line 7-8: replace imports
import { telemetry } from '@/constants/telemetry'

// line 86-88: replace fmtSpeedWithUnit
function fmtSpeedWithUnit(value: number) {
  return telemetry.speed.formatWithUnit(value)
}

// line 104: replace color assignment
const color = telemetry.speed.color
```

Remove `import { fmtSpeed } from '@/helpers/format'` and `import { theme } from '@/constants/theme'`.

Note: `theme` is still used for `theme.gps.text` on line 339. Keep that import if still referenced for non-telemetry styling. Check — if `theme.gps.text` is the only remaining use, keep the import.

- [ ] **Step 2: Update BatteryBar.tsx**

Replace `theme.gps.color` and `theme.warning.color` in `pickColor()` with `telemetry.battVoltage.color` and warning color. Replace `fmtVoltage` with `telemetry.battVoltage.format`:

```tsx
import { StyleSheet, Text, View } from 'react-native'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { telemetry } from '@/constants/telemetry'
import { theme } from '@/constants/theme'

// ...

function pickColor(percent: number | null): string {
  if (percent != null && percent < BATTERY_LOW_PCT) return theme.warning.color
  return telemetry.battVoltage.color
}

// In the component, replace fmtVoltage(voltage) with telemetry.battVoltage.format(voltage):
// line 38: {telemetry.battVoltage.format(voltage)} V
// Actually, use formatWithUnit: {telemetry.battVoltage.formatWithUnit(voltage)}
```

Note: `theme.warning.color` stays for the low-battery conditional — that's a semantic state color, not a telemetry identity color.

- [ ] **Step 3: Verify it compiles**

Run: `bunx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/charts/SpeedGauge.tsx src/components/BatteryBar.tsx
git commit -m "refactor: speed gauge and battery bar use telemetry registry"
```

---

### Task 5: Update Control Detail Screens

**Files:**
- Modify: `src/app/control/speed/index.tsx`
- Modify: `src/app/control/duty/index.tsx`
- Modify: `src/app/control/motor-current/index.tsx`
- Modify: `src/app/control/batt-current/index.tsx`
- Modify: `src/app/control/motor-temp/index.tsx`
- Modify: `src/app/control/controller-temp/index.tsx`
- Modify: `src/app/control/battery/index.tsx`
- Modify: `src/app/control/footpad/index.tsx`
- Modify: `src/app/control/imu/index.tsx`

All these screens follow the same pattern. Replace:
- `theme.X.color` → `telemetry.X.color`
- `fmtSpeed/fmtTemp/fmtCurrent/fmtVoltage(v)` → `telemetry.X.format(v)`
- `` `${fmtX(v)} unit` `` → `telemetry.X.formatWithUnit(v)`
- Hardcoded `RANGE` → `{ y: telemetry.X.chartRange }`
- `CHART_DEFAULTS.X` → `telemetry.X.chartRange`
- Hardcoded title/controlId/unit strings → `telemetry.X.label`, `telemetry.X.controlId`, `telemetry.X.unit`

- [ ] **Step 1: Update speed/index.tsx**

```tsx
import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH } from '@/helpers/format'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const cfg = telemetry.speed
const RANGE = { y: cfg.chartRange }

export default function SpeedScreen() {
  const speed = useLiveMetric(liveSelectors.speed)
  const windowMs = useLiveWindowMs()

  const points = useMemo<TelemetryChartPoint[]>(
    () => speed.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [speed],
  )

  const stats = useMemo(() => {
    if (!points.length) return null
    const values = points.map((p) => p.value)
    return {
      current: values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    }
  }, [points])

  const [selected, setSelected] = useState<TelemetryChartPoint | null>(null)
  const currentPoint = selected ?? points.at(-1) ?? null

  const displayValue = currentPoint ? cfg.formatWithUnit(currentPoint.value) : DASH

  return (
    <ControlDetailLayout title={cfg.label} controlId={cfg.controlId} unit={cfg.unit}>
      <TelemetryLineChart
        label={cfg.label.toUpperCase()}
        value={displayValue}
        points={points}
        currentPoint={currentPoint}
        color={cfg.color}
        range={RANGE}
        height={120}
        onPointSelected={setSelected}
        onGestureStart={() => setSelected(null)}
        formatValue={(v) => cfg.formatWithUnit(v)}
        windowMs={windowMs}
      />
      <StatsRow
        current={stats ? cfg.formatWithUnit(stats.current) : DASH}
        min={stats ? cfg.formatWithUnit(stats.min) : DASH}
        max={stats ? cfg.formatWithUnit(stats.max) : DASH}
        avg={stats ? cfg.formatWithUnit(stats.avg) : DASH}
      />
    </ControlDetailLayout>
  )
}
```

- [ ] **Step 2: Update duty/index.tsx**

Same pattern with `const cfg = telemetry.duty`. Note: duty had inline `toFixed(0)` — now uses `cfg.format`/`cfg.formatWithUnit`.

```tsx
import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH } from '@/helpers/format'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const cfg = telemetry.duty
const RANGE = { y: cfg.chartRange }

export default function DutyScreen() {
  const duty = useLiveMetric(liveSelectors.duty)
  const windowMs = useLiveWindowMs()

  const points = useMemo<TelemetryChartPoint[]>(
    () => duty.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [duty],
  )

  const stats = useMemo(() => {
    if (!points.length) return null
    const values = points.map((p) => p.value)
    return {
      current: values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    }
  }, [points])

  const [selected, setSelected] = useState<TelemetryChartPoint | null>(null)
  const currentPoint = selected ?? points.at(-1) ?? null

  const displayValue = currentPoint ? cfg.formatWithUnit(currentPoint.value) : DASH

  return (
    <ControlDetailLayout title={cfg.label} controlId={cfg.controlId} unit={cfg.unit}>
      <TelemetryLineChart
        label={cfg.label.toUpperCase()}
        value={displayValue}
        points={points}
        currentPoint={currentPoint}
        color={cfg.color}
        range={RANGE}
        height={120}
        onPointSelected={setSelected}
        onGestureStart={() => setSelected(null)}
        formatValue={(v) => cfg.formatWithUnit(v)}
        windowMs={windowMs}
      />
      <StatsRow
        current={stats ? cfg.formatWithUnit(stats.current) : DASH}
        min={stats ? cfg.formatWithUnit(stats.min) : DASH}
        max={stats ? cfg.formatWithUnit(stats.max) : DASH}
        avg={stats ? cfg.formatWithUnit(stats.avg) : DASH}
      />
    </ControlDetailLayout>
  )
}
```

- [ ] **Step 3: Update motor-current/index.tsx**

Same pattern with `const cfg = telemetry.motorCurrent`. Uses `computeAutoRange` with `cfg.chartRange` as baseline:

```tsx
import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH } from '@/helpers/format'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const cfg = telemetry.motorCurrent

export default function MotorCurrentScreen() {
  const motorCurrent = useLiveMetric(liveSelectors.motorCurrent)
  const windowMs = useLiveWindowMs()

  const points = useMemo<TelemetryChartPoint[]>(
    () => motorCurrent.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [motorCurrent],
  )

  const range = useMemo(
    () => computeAutoRange(points, { baseline: cfg.chartRange }),
    [points],
  )

  const stats = useMemo(() => {
    if (!points.length) return null
    const values = points.map((p) => p.value)
    return {
      current: values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    }
  }, [points])

  const [selected, setSelected] = useState<TelemetryChartPoint | null>(null)
  const currentPoint = selected ?? points.at(-1) ?? null

  const displayValue = currentPoint ? cfg.formatWithUnit(currentPoint.value) : DASH

  return (
    <ControlDetailLayout title={cfg.label} controlId={cfg.controlId} unit={cfg.unit}>
      <TelemetryLineChart
        label={cfg.label.toUpperCase()}
        value={displayValue}
        points={points}
        currentPoint={currentPoint}
        color={cfg.color}
        range={range}
        height={120}
        onPointSelected={setSelected}
        onGestureStart={() => setSelected(null)}
        formatValue={(v) => cfg.formatWithUnit(v)}
        windowMs={windowMs}
      />
      <StatsRow
        current={stats ? cfg.formatWithUnit(stats.current) : DASH}
        min={stats ? cfg.formatWithUnit(stats.min) : DASH}
        max={stats ? cfg.formatWithUnit(stats.max) : DASH}
        avg={stats ? cfg.formatWithUnit(stats.avg) : DASH}
      />
    </ControlDetailLayout>
  )
}
```

- [ ] **Step 4: Update batt-current/index.tsx**

Same as motor-current but `const cfg = telemetry.battCurrent` and `liveSelectors.batteryCurrent`:

```tsx
import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH } from '@/helpers/format'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const cfg = telemetry.battCurrent

export default function BattCurrentScreen() {
  const batteryCurrent = useLiveMetric(liveSelectors.batteryCurrent)
  const windowMs = useLiveWindowMs()

  const points = useMemo<TelemetryChartPoint[]>(
    () => batteryCurrent.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [batteryCurrent],
  )

  const range = useMemo(
    () => computeAutoRange(points, { baseline: cfg.chartRange }),
    [points],
  )

  const stats = useMemo(() => {
    if (!points.length) return null
    const values = points.map((p) => p.value)
    return {
      current: values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    }
  }, [points])

  const [selected, setSelected] = useState<TelemetryChartPoint | null>(null)
  const currentPoint = selected ?? points.at(-1) ?? null

  const displayValue = currentPoint ? cfg.formatWithUnit(currentPoint.value) : DASH

  return (
    <ControlDetailLayout title={cfg.label} controlId={cfg.controlId} unit={cfg.unit}>
      <TelemetryLineChart
        label={cfg.label.toUpperCase()}
        value={displayValue}
        points={points}
        currentPoint={currentPoint}
        color={cfg.color}
        range={range}
        height={120}
        onPointSelected={setSelected}
        onGestureStart={() => setSelected(null)}
        formatValue={(v) => cfg.formatWithUnit(v)}
        windowMs={windowMs}
      />
      <StatsRow
        current={stats ? cfg.formatWithUnit(stats.current) : DASH}
        min={stats ? cfg.formatWithUnit(stats.min) : DASH}
        max={stats ? cfg.formatWithUnit(stats.max) : DASH}
        avg={stats ? cfg.formatWithUnit(stats.avg) : DASH}
      />
    </ControlDetailLayout>
  )
}
```

- [ ] **Step 5: Update motor-temp/index.tsx**

Same pattern with `const cfg = telemetry.motorTemp`:

```tsx
import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH } from '@/helpers/format'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const cfg = telemetry.motorTemp

export default function MotorTempScreen() {
  const motorTemp = useLiveMetric(liveSelectors.motorTemp)
  const windowMs = useLiveWindowMs()

  const points = useMemo<TelemetryChartPoint[]>(
    () => motorTemp.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [motorTemp],
  )

  const range = useMemo(
    () => computeAutoRange(points, { baseline: cfg.chartRange }),
    [points],
  )

  const stats = useMemo(() => {
    if (!points.length) return null
    const values = points.map((p) => p.value)
    return {
      current: values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    }
  }, [points])

  const [selected, setSelected] = useState<TelemetryChartPoint | null>(null)
  const currentPoint = selected ?? points.at(-1) ?? null

  const displayValue = currentPoint ? cfg.formatWithUnit(currentPoint.value) : DASH

  return (
    <ControlDetailLayout title={cfg.label} controlId={cfg.controlId} unit={cfg.unit}>
      <TelemetryLineChart
        label={cfg.label.toUpperCase()}
        value={displayValue}
        points={points}
        currentPoint={currentPoint}
        color={cfg.color}
        range={range}
        height={120}
        onPointSelected={setSelected}
        onGestureStart={() => setSelected(null)}
        formatValue={(v) => cfg.formatWithUnit(v)}
        windowMs={windowMs}
      />
      <StatsRow
        current={stats ? cfg.formatWithUnit(stats.current) : DASH}
        min={stats ? cfg.formatWithUnit(stats.min) : DASH}
        max={stats ? cfg.formatWithUnit(stats.max) : DASH}
        avg={stats ? cfg.formatWithUnit(stats.avg) : DASH}
      />
    </ControlDetailLayout>
  )
}
```

- [ ] **Step 6: Update controller-temp/index.tsx**

Identical to motor-temp but `const cfg = telemetry.controllerTemp` and `liveSelectors.controllerTemp`:

```tsx
import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH } from '@/helpers/format'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const cfg = telemetry.controllerTemp

export default function ControllerTempScreen() {
  const controllerTemp = useLiveMetric(liveSelectors.controllerTemp)
  const windowMs = useLiveWindowMs()

  const points = useMemo<TelemetryChartPoint[]>(
    () => controllerTemp.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [controllerTemp],
  )

  const range = useMemo(
    () => computeAutoRange(points, { baseline: cfg.chartRange }),
    [points],
  )

  const stats = useMemo(() => {
    if (!points.length) return null
    const values = points.map((p) => p.value)
    return {
      current: values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    }
  }, [points])

  const [selected, setSelected] = useState<TelemetryChartPoint | null>(null)
  const currentPoint = selected ?? points.at(-1) ?? null

  const displayValue = currentPoint ? cfg.formatWithUnit(currentPoint.value) : DASH

  return (
    <ControlDetailLayout title={cfg.label} controlId={cfg.controlId} unit={cfg.unit}>
      <TelemetryLineChart
        label={cfg.label.toUpperCase()}
        value={displayValue}
        points={points}
        currentPoint={currentPoint}
        color={cfg.color}
        range={range}
        height={120}
        onPointSelected={setSelected}
        onGestureStart={() => setSelected(null)}
        formatValue={(v) => cfg.formatWithUnit(v)}
        windowMs={windowMs}
      />
      <StatsRow
        current={stats ? cfg.formatWithUnit(stats.current) : DASH}
        min={stats ? cfg.formatWithUnit(stats.min) : DASH}
        max={stats ? cfg.formatWithUnit(stats.max) : DASH}
        avg={stats ? cfg.formatWithUnit(stats.avg) : DASH}
      />
    </ControlDetailLayout>
  )
}
```

- [ ] **Step 7: Update battery/index.tsx**

Uses `computeAutoRange` with board-specific overrides. Replace `theme.gps.color` with `telemetry.battVoltage.color`, `fmtVoltage` with `telemetry.battVoltage.format`:

```tsx
import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH } from '@/helpers/format'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useBoardStore } from '@/store/boardStore'
import { useLiveWindowMs } from '@/store/settingsStore'

const cfg = telemetry.battVoltage

export default function BatteryScreen() {
  const batteryVoltage = useLiveMetric(liveSelectors.batteryVoltage)
  const windowMs = useLiveWindowMs()
  const board = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))

  const points = useMemo<TelemetryChartPoint[]>(
    () => batteryVoltage.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [batteryVoltage],
  )

  const range = useMemo(() => {
    if (board?.minVoltage != null && board?.maxVoltage != null) {
      return { y: { min: board.minVoltage, max: board.maxVoltage } }
    }
    return computeAutoRange(points, { minSpan: cfg.minSpan })
  }, [board?.minVoltage, board?.maxVoltage, points])

  const stats = useMemo(() => {
    if (!points.length) return null
    const values = points.map((p) => p.value)
    return {
      current: values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    }
  }, [points])

  const [selected, setSelected] = useState<TelemetryChartPoint | null>(null)
  const currentPoint = selected ?? points.at(-1) ?? null

  const displayValue = currentPoint ? cfg.formatWithUnit(currentPoint.value) : DASH

  return (
    <ControlDetailLayout title={cfg.label} controlId={cfg.controlId} unit={cfg.unit}>
      <TelemetryLineChart
        label={cfg.label.toUpperCase()}
        value={displayValue}
        points={points}
        currentPoint={currentPoint}
        color={cfg.color}
        range={range}
        height={120}
        onPointSelected={setSelected}
        onGestureStart={() => setSelected(null)}
        formatValue={(v) => cfg.formatWithUnit(v)}
        windowMs={windowMs}
      />
      <StatsRow
        current={stats ? cfg.formatWithUnit(stats.current) : DASH}
        min={stats ? cfg.formatWithUnit(stats.min) : DASH}
        max={stats ? cfg.formatWithUnit(stats.max) : DASH}
        avg={stats ? cfg.formatWithUnit(stats.avg) : DASH}
      />
    </ControlDetailLayout>
  )
}
```

- [ ] **Step 8: Update footpad/index.tsx**

Replace `CHART_DEFAULTS.adc` with `telemetry.footpadAdc1.chartRange`, `theme.wheel.color`/`theme.bran.color` with registry colors, `fmt(v, 3)` with `telemetry.footpadAdc1.format(v)`:

```tsx
import { useState, useMemo } from 'react'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { StatsRow } from '@/components/control/StatsRow'
import { DASH } from '@/helpers/format'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const adc1 = telemetry.footpadAdc1
const adc2 = telemetry.footpadAdc2

function computeStats(points: TelemetryChartPoint[]) {
  if (!points.length) return null
  const values = points.map((p) => p.value)
  return {
    current: values[values.length - 1],
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length,
  }
}

export default function FootpadScreen() {
  const adc1Data = useLiveMetric(liveSelectors.footpadAdc1)
  const adc2Data = useLiveMetric(liveSelectors.footpadAdc2)
  const windowMs = useLiveWindowMs()

  const adc1Points = useMemo<TelemetryChartPoint[]>(
    () => adc1Data.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [adc1Data],
  )

  const adc2Points = useMemo<TelemetryChartPoint[]>(
    () => adc2Data.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [adc2Data],
  )

  const adc1Range = useMemo(
    () => computeAutoRange(adc1Points, { baseline: adc1.chartRange }),
    [adc1Points],
  )
  const adc2Range = useMemo(
    () => computeAutoRange(adc2Points, { baseline: adc2.chartRange }),
    [adc2Points],
  )

  const adc1Stats = useMemo(() => computeStats(adc1Points), [adc1Points])
  const adc2Stats = useMemo(() => computeStats(adc2Points), [adc2Points])

  const [selected1, setSelected1] = useState<TelemetryChartPoint | null>(null)
  const [selected2, setSelected2] = useState<TelemetryChartPoint | null>(null)
  const current1 = selected1 ?? adc1Points.at(-1) ?? null
  const current2 = selected2 ?? adc2Points.at(-1) ?? null

  return (
    <ControlDetailLayout title="Footpad">
      <TelemetryLineChart
        label={adc1.label.toUpperCase()}
        value={current1 ? adc1.format(current1.value) : DASH}
        points={adc1Points}
        currentPoint={current1}
        color={adc1.color}
        range={adc1Range}
        height={80}
        onPointSelected={setSelected1}
        onGestureStart={() => setSelected1(null)}
        formatValue={(v) => adc1.format(v)}
        windowMs={windowMs}
      />
      <StatsRow
        current={adc1Stats ? adc1.format(adc1Stats.current) : DASH}
        min={adc1Stats ? adc1.format(adc1Stats.min) : DASH}
        max={adc1Stats ? adc1.format(adc1Stats.max) : DASH}
        avg={adc1Stats ? adc1.format(adc1Stats.avg) : DASH}
      />

      <TelemetryLineChart
        label={adc2.label.toUpperCase()}
        value={current2 ? adc2.format(current2.value) : DASH}
        points={adc2Points}
        currentPoint={current2}
        color={adc2.color}
        range={adc2Range}
        height={80}
        onPointSelected={setSelected2}
        onGestureStart={() => setSelected2(null)}
        formatValue={(v) => adc2.format(v)}
        windowMs={windowMs}
      />
      <StatsRow
        current={adc2Stats ? adc2.format(adc2Stats.current) : DASH}
        min={adc2Stats ? adc2.format(adc2Stats.min) : DASH}
        max={adc2Stats ? adc2.format(adc2Stats.max) : DASH}
        avg={adc2Stats ? adc2.format(adc2Stats.avg) : DASH}
      />
    </ControlDetailLayout>
  )
}
```

- [ ] **Step 9: Update imu/index.tsx**

Replace `CHART_DEFAULTS.pitch/roll/balance` with `telemetry.pitch/roll/balancePitch.chartRange`, colors and formatting with registry:

```tsx
import { useState, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import type { TelemetryChartPoint } from '@/components/charts/chartMath'
import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { DASH } from '@/helpers/format'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const pitchCfg = telemetry.pitch
const rollCfg = telemetry.roll
const balanceCfg = telemetry.balancePitch

export default function ImuScreen() {
  const pitch = useLiveMetric(liveSelectors.pitch)
  const roll = useLiveMetric(liveSelectors.roll)
  const balancePitch = useLiveMetric(liveSelectors.balancePitch)
  const windowMs = useLiveWindowMs()

  const pitchPoints = useMemo<TelemetryChartPoint[]>(
    () => pitch.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [pitch],
  )

  const rollPoints = useMemo<TelemetryChartPoint[]>(
    () => roll.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [roll],
  )

  const balancePoints = useMemo<TelemetryChartPoint[]>(
    () => balancePitch.map((p) => ({ date: new Date(p.ts), value: p.value })),
    [balancePitch],
  )

  const pitchRange = useMemo(
    () => computeAutoRange(pitchPoints, { baseline: pitchCfg.chartRange }),
    [pitchPoints],
  )
  const rollRange = useMemo(
    () => computeAutoRange(rollPoints, { baseline: rollCfg.chartRange }),
    [rollPoints],
  )
  const balanceRange = useMemo(
    () => computeAutoRange(balancePoints, { baseline: balanceCfg.chartRange }),
    [balancePoints],
  )

  const [selectedPitch, setSelectedPitch] = useState<TelemetryChartPoint | null>(null)
  const [selectedRoll, setSelectedRoll] = useState<TelemetryChartPoint | null>(null)
  const [selectedBalance, setSelectedBalance] = useState<TelemetryChartPoint | null>(null)

  const currentPitch = selectedPitch ?? pitchPoints.at(-1) ?? null
  const currentRoll = selectedRoll ?? rollPoints.at(-1) ?? null
  const currentBalance = selectedBalance ?? balancePoints.at(-1) ?? null

  return (
    <ControlDetailLayout title="IMU">
      <View style={styles.liveRow}>
        <View style={styles.liveCell}>
          <Text style={styles.liveLabel}>{pitchCfg.label.toUpperCase()}</Text>
          <Text style={styles.liveValue}>
            {pitchPoints.at(-1) ? pitchCfg.formatWithUnit(pitchPoints.at(-1)!.value) : DASH}
          </Text>
        </View>
        <View style={styles.liveCell}>
          <Text style={styles.liveLabel}>{rollCfg.label.toUpperCase()}</Text>
          <Text style={styles.liveValue}>
            {rollPoints.at(-1) ? rollCfg.formatWithUnit(rollPoints.at(-1)!.value) : DASH}
          </Text>
        </View>
        <View style={styles.liveCell}>
          <Text style={styles.liveLabel}>BAL</Text>
          <Text style={styles.liveValue}>
            {balancePoints.at(-1) ? balanceCfg.formatWithUnit(balancePoints.at(-1)!.value) : DASH}
          </Text>
        </View>
      </View>

      <TelemetryLineChart
        label={pitchCfg.label.toUpperCase()}
        value={currentPitch ? pitchCfg.formatWithUnit(currentPitch.value) : DASH}
        points={pitchPoints}
        currentPoint={currentPitch}
        color={pitchCfg.color}
        range={pitchRange}
        height={80}
        onPointSelected={setSelectedPitch}
        onGestureStart={() => setSelectedPitch(null)}
        formatValue={(v) => pitchCfg.formatWithUnit(v)}
        windowMs={windowMs}
      />

      <TelemetryLineChart
        label={rollCfg.label.toUpperCase()}
        value={currentRoll ? rollCfg.formatWithUnit(currentRoll.value) : DASH}
        points={rollPoints}
        currentPoint={currentRoll}
        color={rollCfg.color}
        range={rollRange}
        height={80}
        onPointSelected={setSelectedRoll}
        onGestureStart={() => setSelectedRoll(null)}
        formatValue={(v) => rollCfg.formatWithUnit(v)}
        windowMs={windowMs}
      />

      <TelemetryLineChart
        label={balanceCfg.label.toUpperCase()}
        value={currentBalance ? balanceCfg.formatWithUnit(currentBalance.value) : DASH}
        points={balancePoints}
        currentPoint={currentBalance}
        color={balanceCfg.color}
        range={balanceRange}
        height={80}
        onPointSelected={setSelectedBalance}
        onGestureStart={() => setSelectedBalance(null)}
        formatValue={(v) => balanceCfg.formatWithUnit(v)}
        windowMs={windowMs}
      />
    </ControlDetailLayout>
  )
}

// styles stay unchanged
```

- [ ] **Step 10: Verify it compiles**

Run: `bunx tsc --noEmit`

- [ ] **Step 11: Commit**

```bash
git add src/app/control/
git commit -m "refactor: control screens use telemetry registry"
```

---

### Task 6: Update History Screen

**Files:**
- Modify: `src/components/history/HistoryMapPlayer.tsx`
- Modify: `src/components/history/historyChartMetrics.ts`

- [ ] **Step 1: Update historyChartMetrics.ts**

Replace hardcoded labels with registry lookups:

```ts
import { telemetry } from '@/constants/telemetry'

export type OptionalChartMetric =
  | 'duty'
  | 'battery'
  | 'tempMotor'
  | 'tempController'
  | 'motorCurrent'
  | 'batteryCurrent'

export const OPTIONAL_CHART_METRICS: ReadonlyArray<{
  key: OptionalChartMetric
  label: string
  multilineLabel?: [string, string]
}> = [
  { key: 'duty', label: telemetry.duty.label, multilineLabel: ['Duty', 'Cycle'] },
  { key: 'battery', label: telemetry.battVoltage.label, multilineLabel: ['Battery', 'Voltage'] },
  { key: 'tempMotor', label: telemetry.motorTemp.label, multilineLabel: ['Motor', 'Temp'] },
  { key: 'tempController', label: telemetry.controllerTemp.label, multilineLabel: ['Controller', 'Temp'] },
  { key: 'motorCurrent', label: telemetry.motorCurrent.label, multilineLabel: ['Motor', 'Current'] },
  { key: 'batteryCurrent', label: telemetry.battCurrent.label, multilineLabel: ['Batt', 'Current'] },
]

// rest of file unchanged
```

- [ ] **Step 2: Update HistoryMapPlayer.tsx optionalChartConfigs**

Replace hardcoded hex colors (lines 331-424) with `telemetry.X.color` and `telemetry.X.formatWithUnit`:

In the `optionalChartConfigs` useMemo, replace each config object's `color` and `formatValue`:

```tsx
// Add import at top:
import { telemetry } from '@/constants/telemetry'

// In the optionalChartConfigs useMemo, replace the array entries:
{
  key: 'duty' as const,
  label: telemetry.duty.label,
  value: currentBoard ? fmtDutyPercent(currentBoard.dutyCycle, false) : '-',
  points: dutyPoints,
  color: telemetry.duty.color,
  range: { y: { min: -100, max: 100 } },
  currentPoint: currentChartSample
    ? { date: new Date(currentChartSample.capturedAtMs), value: dutyPercent(currentChartSample.dutyCycle, false) }
    : null,
  formatValue: (value: number) => `${value.toFixed(0)}%`,
},
{
  key: 'battery' as const,
  label: telemetry.battVoltage.label,
  value: currentBoard ? telemetry.battVoltage.formatWithUnit(currentBoard.batteryVoltage) : '-',
  points: batteryVoltagePoints,
  color: telemetry.battVoltage.color,
  range: batteryRange,
  currentPoint: currentChartSample
    ? { date: new Date(currentChartSample.capturedAtMs), value: currentChartSample.batteryVoltage }
    : null,
  formatValue: (value: number) => telemetry.battVoltage.formatWithUnit(value),
},
{
  key: 'tempMotor' as const,
  label: telemetry.motorTemp.label,
  value: currentBoard?.tempMotor != null ? telemetry.motorTemp.formatWithUnit(currentBoard.tempMotor) : '-',
  points: tempMotorPoints,
  color: telemetry.motorTemp.color,
  range: tempMotorRange,
  currentPoint: currentChartSample?.tempMotor != null
    ? { date: new Date(currentChartSample.capturedAtMs), value: currentChartSample.tempMotor }
    : null,
  formatValue: (value: number) => telemetry.motorTemp.formatWithUnit(value),
},
{
  key: 'tempController' as const,
  label: telemetry.controllerTemp.label,
  value: currentBoard?.tempMosfet != null ? telemetry.controllerTemp.formatWithUnit(currentBoard.tempMosfet) : '-',
  points: tempMosfetPoints,
  color: telemetry.controllerTemp.color,
  range: tempMosfetRange,
  currentPoint: currentChartSample?.tempMosfet != null
    ? { date: new Date(currentChartSample.capturedAtMs), value: currentChartSample.tempMosfet }
    : null,
  formatValue: (value: number) => telemetry.controllerTemp.formatWithUnit(value),
},
{
  key: 'motorCurrent' as const,
  label: telemetry.motorCurrent.label,
  value: currentBoard ? telemetry.motorCurrent.formatWithUnit(currentBoard.motorCurrent) : '-',
  points: motorCurrentPoints,
  color: telemetry.motorCurrent.color,
  range: motorCurrentRange,
  currentPoint: currentChartSample
    ? { date: new Date(currentChartSample.capturedAtMs), value: currentChartSample.motorCurrent }
    : null,
  formatValue: (value: number) => telemetry.motorCurrent.formatWithUnit(value),
},
{
  key: 'batteryCurrent' as const,
  label: telemetry.battCurrent.label,
  value: currentBoard ? telemetry.battCurrent.formatWithUnit(currentBoard.batteryCurrent) : '-',
  points: batteryCurrentPoints,
  color: telemetry.battCurrent.color,
  range: batteryCurrentRange,
  currentPoint: currentChartSample
    ? { date: new Date(currentChartSample.capturedAtMs), value: currentChartSample.batteryCurrent }
    : null,
  formatValue: (value: number) => telemetry.battCurrent.formatWithUnit(value),
},
```

Note: `fmtDutyPercent` and `dutyPercent` are still needed for the duty entry because history stores raw 0-1 duty values that need conversion. Keep that import.

Also update the speed chart section if it has hardcoded color — find and replace with `telemetry.speed.color`.

- [ ] **Step 3: Verify it compiles**

Run: `bunx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/history/HistoryMapPlayer.tsx src/components/history/historyChartMetrics.ts
git commit -m "refactor: history screen uses telemetry registry"
```

---

### Task 7: Update TelemetryCard CONTROL_UNITS

**Files:**
- Modify: `src/components/TelemetryCard.tsx`

- [ ] **Step 1: Replace CONTROL_UNITS with registry lookup**

Delete the `CONTROL_UNITS` constant (lines 9-15). In `AlertBadge`, derive unit from telemetry registry:

```tsx
// Add import:
import { telemetry, type TelemetryMetricKey } from '@/constants/telemetry'

// Replace CONTROL_UNITS lookup in AlertBadge (line 77):
// Old: const unit = CONTROL_UNITS[controlId] ?? ''
// New:
const unit = Object.values(telemetry).find((t) => t.controlId === controlId)?.unit ?? ''
```

Delete `const CONTROL_UNITS` block entirely.

- [ ] **Step 2: Verify it compiles**

Run: `bunx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/TelemetryCard.tsx
git commit -m "refactor: TelemetryCard derives units from telemetry registry"
```

---

### Task 8: Delete chartDefaults.ts and Clean Up format.ts

**Files:**
- Delete: `src/constants/chartDefaults.ts`
- Modify: `src/helpers/format.ts`

- [ ] **Step 1: Verify no remaining imports of chartDefaults**

Run: `grep -r "chartDefaults" src/` — should show zero results after Tasks 5 updates.
If any remain, fix them first.

- [ ] **Step 2: Delete `src/constants/chartDefaults.ts`**

```bash
rm src/constants/chartDefaults.ts
```

- [ ] **Step 3: Remove unused format functions from format.ts**

After all consumers migrated to registry, these functions should be unused:
- `fmtSpeed` — check: still used in `HistorySessionSheet.tsx` line 51. Keep or migrate.
- `fmtTemp` — should be unused now. Remove.
- `fmtCurrent` — should be unused now. Remove.
- `fmtVoltage` — should be unused now (BatteryBar migrated). Remove.
- `fmtAdc` — already unused. Remove.

For `fmtSpeed` in `HistorySessionSheet.tsx`, replace with `telemetry.speed.format`:

```tsx
// In HistorySessionSheet.tsx, replace:
import { fmtSpeed } from '@/helpers/format'
// with:
import { telemetry } from '@/constants/telemetry'

// line 51: replace fmtSpeed(session.maxSpeedKmh) with telemetry.speed.format(session.maxSpeedKmh)
```

Then remove `fmtSpeed`, `fmtTemp`, `fmtCurrent`, `fmtVoltage`, `fmtAdc` from `format.ts`.

Keep in `format.ts`:
- `DASH`
- `fmt()` (generic, still useful)
- `dutyPercent()` (conversion function, used in HistoryMapPlayer)
- `fmtDutyPercent()` (used in HistoryMapPlayer)
- `fmtKm()` (distance formatting, not telemetry)

- [ ] **Step 4: Verify it compiles**

Run: `bunx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git rm src/constants/chartDefaults.ts
git add src/helpers/format.ts src/components/history/HistorySessionSheet.tsx
git commit -m "refactor: delete chartDefaults.ts and unused format functions"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Full type check**

Run: `bunx tsc --noEmit`

- [ ] **Step 2: Grep for stale imports**

```bash
grep -r "CHART_DEFAULTS" src/
grep -r "fmtSpeed\|fmtTemp\|fmtCurrent\|fmtVoltage\|fmtAdc" src/
grep -r "CONTROL_UNITS" src/
```

All should return zero results.

- [ ] **Step 3: Grep for hardcoded telemetry colors**

```bash
grep -rn "#34d399\|#fbbf24\|#f97316\|#ef4444\|#22c55e\|#06b6d4\|#38bdf8\|#a855f7" src/
```

Should only appear in `src/constants/telemetry.ts` (the registry) and `src/constants/theme.ts` (semantic UI colors that happen to share hex values). Any other hits need migration.

- [ ] **Step 4: Start dev server and verify visually**

Run: `bun start`

Check each screen:
1. Dashboard — cards should show new colors (duty=emerald, motor current=green, batt current=cyan, controller temp=red, batt voltage=amber)
2. Control detail screens — colors match cards
3. History — colors match everything else
