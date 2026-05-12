# Dual Gauge: Split Speed + Duty Cycle

## Context

The current dashboard has a full-width 180° half-circle speed gauge (`SpeedGauge.tsx`) with a sparkline underneath, and a separate `DutyCard` in the grid below. The user wants speed and duty cycle side-by-side in a single widget: left quarter-arc for speed, right quarter-arc for duty, big numbers inside each arc bowl, sparkline charts under each half.

## Design

### Visual Layout

```
┌─────────────────────────────────────┐
│                          TOTAL 2.1km│
│       ╱          ╲╱          ╲      │
│      │            ││            │   │
│      │    42      ││    67      │   │
│      │   km/h    ││     %      │   │
│       ────────────┘└────────────    │
│    0 ─── 50    │    0 ─── 100      │
│   ▁▂▃▅▃▂▁▂▃   │   ▁▃▅▇▅▃▁▂       │
│   speed spark  │   duty spark      │
└─────────────────────────────────────┘
  ← tap: speed     tap: duty →
```

### Component Architecture

**New file: `src/components/charts/DualGauge.tsx`**

Top-level card component. Renders two `QuarterArc` sub-components in a horizontal row, each wrapped in a `Pressable` for navigation.

```
DualGauge (card wrapper, dark bg, rounded corners)
├─ distance label (top-right corner, unchanged)
├─ Row (flexDirection: 'row', gap between halves)
│  ├─ Pressable (flex: 1) → routes.controlSpeed
│  │  ├─ QuarterArc (side: 'left', color from telemetry.speed)
│  │  │  ├─ SVG: 90° arc sweeping 9-o'clock → 12-o'clock
│  │  │  ├─ Animated wedge fill with radial gradient
│  │  │  ├─ Animated stroke arc overlay
│  │  │  ├─ Animated position marker
│  │  │  ├─ AnimatedTextInput value (~36-40px, centered in bowl)
│  │  │  ├─ Unit label ("km/h") below value
│  │  │  ├─ Alert markers (speed alerts only)
│  │  │  └─ Tick labels: "0" at bottom-left, "{max}" at top-center
│  │  └─ Sparkline (speed series, same height as current 28px)
│  │
│  └─ Pressable (flex: 1) → routes.controlDuty
│     ├─ QuarterArc (side: 'right', color from telemetry.duty)
│     │  ├─ SVG: 90° arc sweeping 12-o'clock → 3-o'clock
│     │  ├─ Animated wedge fill with radial gradient
│     │  ├─ Animated stroke arc overlay
│     │  ├─ Animated position marker
│     │  ├─ AnimatedTextInput value (~36-40px, centered in bowl)
│     │  ├─ Unit label ("%") below value
│     │  └─ Tick labels: "{max}" at top-center, "0" at bottom-right
│     └─ Sparkline (duty series)
```

### SVG Geometry

Current full gauge: viewBox `200×120`, center `(100, 100)`, radius `80`, sweeps `π → 0` (180°).

Each quarter arc:

- **Left arc:** viewBox `100×120`, center at right edge `(100, 100)`, radius `80`. Sweeps `π → π/2` (9-o'clock up to 12-o'clock). ViewBox crops to left half only.
- **Right arc:** viewBox `100×120`, center at left edge `(0, 100)`, radius `80`. Sweeps `π/2 → 0` (12-o'clock down to 3-o'clock). Mirror of left.

Exact viewBox values may need tuning during implementation to ensure the arc stroke and marker aren't clipped at edges.

The `polar()` function is parameterized:
- Left: `angle = π - (π/2) * fraction` (fraction 0→1 maps to π→π/2)
- Right: `angle = π/2 - (π/2) * fraction` (fraction 0→1 maps to π/2→0)

`arcPath()`, `wedgePath()`, and `rangeWedgePath()` adapted for quarter-circle math.

### Value Display

- Font size reduced from 56px to ~36-40px to fit inside quarter-arc bowl
- Unit label (km/h or %) displayed below the number as small text (~11px)
- GPS readout removed from this view
- Distance readout stays in top-right corner of the card

### Colors

Use the unified `telemetry` config from `src/constants/telemetry.ts`:
- Speed: `telemetry.speed.color` (`#38bdf8` — sky blue)
- Duty: `telemetry.duty.color` (`#34d399` — emerald green)

Each half gets its own `RadialGradient` using its respective color for the glow effect.

### Data Flow

No changes to the telemetry pipeline. Data sources:

| Metric | SharedValue | Series hook |
|--------|-------------|-------------|
| Speed  | `liveTelemetryRuntime.values.speedKmh` | `useLiveMetric(liveSelectors.speed)` |
| Duty   | `liveTelemetryRuntime.values.dutyPercent` | `useLiveMetric(liveSelectors.duty)` |

### Wrapper Component

**Rename: `src/components/cards/SpeedIndicator.tsx` → `src/components/cards/DualGaugeIndicator.tsx`**

```typescript
export function DualGaugeIndicator() {
  const speedSeries = useLiveMetric(liveSelectors.speed)
  const dutySeries = useLiveMetric(liveSelectors.duty)
  const windowMs = useLiveWindowMs()
  const speedAlerts = useSpeedAlerts() // extracted from current SpeedIndicator

  return (
    <DualGauge
      speedValue={liveTelemetryRuntime.values.speedKmh}
      dutyValue={liveTelemetryRuntime.values.dutyPercent}
      speedSeries={speedSeries}
      dutySeries={dutySeries}
      windowMs={windowMs}
      speedMax={50}
      dutyMax={100}
      speedAlerts={speedAlerts}
      distance={undefined}
    />
  )
}
```

### TelemetryView Changes

- Replace `<SpeedIndicator />` Pressable block with `<DualGaugeIndicator />` (no outer Pressable — tap zones handled internally)
- Remove `<DutyCard />` from grid row
- MotorTempCard moves to pair with next available card, or sits alone in row

### Files Modified

| File | Change |
|------|--------|
| `src/components/charts/DualGauge.tsx` | **New** — replaces SpeedGauge |
| `src/components/cards/DualGaugeIndicator.tsx` | **New** — replaces SpeedIndicator |
| `src/components/TelemetryView.tsx` | Swap SpeedIndicator → DualGaugeIndicator, remove DutyCard from grid |
| `src/components/cards/index.ts` | Update exports |
| `src/components/charts/SpeedGauge.tsx` | **Delete** (all logic moves to DualGauge) |
| `src/components/cards/SpeedIndicator.tsx` | **Delete** (replaced by DualGaugeIndicator) |

### Files NOT Modified

- `src/components/cards/DutyCard.tsx` — keep file, just remove from grid (may be useful elsewhere later)
- `src/components/charts/Sparkline.tsx` — reused as-is
- `src/components/charts/chartMath.ts` — reused as-is
- `src/constants/telemetry.ts` — read colors from here, do not modify
- `src/telemetry/liveTelemetryRuntime.ts` — no changes
- `src/hooks/useLiveMetric.ts` — no changes
- `src/app/control/speed/index.tsx` — detail page unchanged
- `src/app/control/duty/index.tsx` — detail page unchanged

## Verification

1. Run `bun test` — ensure no regressions
2. Connect to VESC board, verify:
   - Both arcs animate with live values
   - Speed sparkline shows history on left
   - Duty sparkline shows history on right
   - Tapping left half navigates to speed detail
   - Tapping right half navigates to duty detail
   - Alert markers appear on speed arc
   - Distance label renders in top-right
3. Disconnect — verify dimmed state still works
4. Check layout on different screen widths (phone portrait)
