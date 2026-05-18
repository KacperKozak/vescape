# Native Profile Stats Design

## Goal

Add useful profile statistics without letting JavaScript read the telemetry database directly. Native code owns telemetry storage and aggregation. JavaScript renders profile state and sends month-selection intents.

The profile screen will show all-time riding stats at the top and calendar-month stats below it. The month section supports previous/next navigation and a picker for months with recorded rides.

## Data Ownership

Native remains the durable source of truth for telemetry history, session grouping, and aggregate statistics. JavaScript does not open the SQLite database and does not own telemetry schema or migrations.

This avoids coupling the UI layer to native database internals, keeps concurrent database access under native control, and gives the recorder freedom to change schema behind stable bridge APIs.

## Native API

Add three native module endpoints:

```ts
getTotalProfileStats(): Promise<ProfileStats>
getMonthlyProfileStats(options: ProfileStatsMonth): Promise<ProfileStats>
getProfileStatMonths(): Promise<ProfileStatsMonth[]>
```

Shared payloads:

```ts
export interface ProfileStats {
  distanceM: number | null
  rideCount: number
  rideTimeMs: number
  topSpeedKmh: number
  avgSpeedKmh: number
  longestRideM: number | null
  batteryUsedWh: number | null
  batteryRegenWh: number | null
}

export interface ProfileStatsMonth {
  year: number
  month: number
}
```

`month` is 1-12. Native returns raw month data only; JavaScript formats labels such as "May 2026" using locale-aware date formatting.

## Aggregation Rules

Native profile stats use the same conceptual session rules as current history sessions:

- split sessions by device change
- split sessions after gaps greater than 10 minutes
- split sessions after disconnect, app stop, or error boundaries
- calculate session duration from first sample time to last sample time
- use only VESC board odometer distance for ride distance
- do not use GPS route distance as a fallback for profile stats
- calculate battery energy from VESC battery voltage, battery current, and sample timing
- count month membership by session start time

`getTotalProfileStats()` aggregates all sessions across all stored telemetry.

`getMonthlyProfileStats({ year, month })` aggregates sessions whose `startAtMs` falls inside that calendar month in the device's local timezone. Rides that cross midnight or month boundaries remain assigned to their start month for clarity and simple navigation.

`getProfileStatMonths()` returns distinct calendar months that contain at least one session, newest first.

## Stat Meanings

- `distanceM`: sum of VESC board odometer session distances, or `null` when no session has odometer distance data.
- `rideCount`: number of grouped sessions.
- `rideTimeMs`: sum of session durations.
- `topSpeedKmh`: highest observed VESC board speed across included sessions.
- `avgSpeedKmh`: distance-weighted average when odometer distance and duration exist; otherwise sample-weighted average from VESC board bucket speeds.
- `longestRideM`: highest odometer-derived session distance, or `null` when distance is unavailable.
- `batteryUsedWh`: gross consumed battery energy, or `null` when energy cannot be calculated.
- `batteryRegenWh`: regenerated battery energy, or `null` when energy cannot be calculated.

Battery energy is calculated from board telemetry only. For each valid adjacent sample interval, native integrates `batteryVoltage * batteryCurrent` over elapsed time. Positive power contributes to `batteryUsedWh`; negative power contributes its absolute value to `batteryRegenWh`. Unrealistic or very large sample gaps are excluded from energy integration so reconnect gaps do not inflate totals.

For empty datasets, native returns zero counts and `null` measurement fields:

```ts
{
  distanceM: null,
  rideCount: 0,
  rideTimeMs: 0,
  topSpeedKmh: 0,
  avgSpeedKmh: 0,
  longestRideM: null,
  batteryUsedWh: null,
  batteryRegenWh: null
}
```

## Profile UI

`src/app/profile.tsx` replaces the placeholder with a stats screen.

Top section:

- prominent all-time distance
- compact all-time cards for rides, ride time, top speed, longest ride, average speed, battery used, and regen

Month section:

- header row with previous arrow, month picker button, and next arrow
- arrows navigate among months returned by `getProfileStatMonths()`
- picker opens a compact month selector
- cards show selected month distance, rides, ride time, average speed, top speed, longest ride, battery used, and regen
- when no telemetry exists, show empty all-time/month stats and a concise empty message

Icons use `phosphor-react-native` with `Icon`-suffixed exports.

## Data Flow

On profile mount:

1. Call `getTotalProfileStats()`.
2. Call `getProfileStatMonths()`.
3. Select the current calendar month if it exists; otherwise select the newest returned month.
4. Call `getMonthlyProfileStats(selectedMonth)` when a month is selected.

Changing month only calls `getMonthlyProfileStats()`. All-time stats do not refetch unless the screen explicitly refreshes.

If recording changes while profile is open, the first implementation can refresh stats when the profile screen regains focus. Live, per-frame updates are out of scope.

## Error Handling

If a native stats call fails, show an inline error state with a retry action. Keep any already-loaded all-time stats visible when monthly stats fail, and keep available months visible when total stats fail.

If months load empty, disable arrows and picker. The month section can show the current calendar month label with zero stats.

## Testing

Native tests cover:

- empty database stats
- total aggregation across multiple sessions
- calendar month filtering
- month list ordering
- device changes and boundary/gap session splits
- VESC board odometer distance only, with no GPS fallback
- battery used and regen energy integration
- top speed, longest ride, and average speed aggregation

TypeScript checks cover the new bridge types and profile call sites.

UI behavior can be covered with focused helper tests if month navigation logic is extracted. Do not add tests for trivial formatting-only predicates.

## Out of Scope

- Direct JavaScript SQLite access.
- Drizzle integration.
- Calories, efficiency, battery cycles, or Wh/km.
- Splitting one ride across multiple months.
- Live-updating profile stats on every telemetry frame.
