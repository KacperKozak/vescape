# Charging Detection Investigation

→ [index](./index.md)

## Goal

Show a visual charging indicator in the telemetry UI when the board is connected to a wall charger.

## What We Tried

### 1. Refloat state 14 (CHARGING)

`state_compat` value `14` exists in Refloat for when the board enters a charging state. Checked via `v.state & 0xf === 14`.

**Result:** Never triggered. The board always reports `FAULT_STARTUP` (state 11) when stationary and not riding, including when the charger is plugged in. State 14 requires Refloat to actively detect and enter charging mode, which doesn't happen on this hardware.

### 2. `batteryCurrent` negative

When regen-braking during riding, current flows _into_ the battery through the VESC motor controller. This shows as a negative `batteryCurrent`. However, this is a riding indicator ("braking hard"), not "wall charger is plugged in."

**Result:** Always `0.0` when stationary (charger or not). Not useful for detecting wall charging.

### 3. Mode 4 — `d->charging.current` / `d->charging.voltage`

Refloat mode 4 appends two extra fields at bytes 55–58 of the `COMMAND_GET_ALLDATA` response:

- `[55–56]` `int16 / 10` → `charging.current` (A)
- `[57–58]` `int16 / 10` → `charging.voltage` (V)

These come from Refloat's `charging` subsystem (`src/charging.h`), which is designed to detect an external charger connected to a dedicated charging circuit wired through or sensed by the VESC.

We wired up the full stack for mode 4:

- Android native parser extended to read bytes 55–58
- `RefloatTelemetry` data class extended with `chargingCurrent: Double?` / `chargingVoltage: Double?`
- `TelemetryEvent` TS interface extended
- `RefloatValues` TS interface extended
- `parseGetAllData` in `refloat.ts` extended
- Poll mode changed from `2` → `4`

**Confirmed working via logcat:**

```
parseGetAllData: mode=4 payloadSize=59
parseGetAllData: chargingCurrent=0.0 chargingVoltage=0.0
```

**Result:** Always `0.0`. The charger on this hardware connects **directly to the battery**, bypassing the VESC motor controller entirely. The VESC has no current sensor on the charging path, so `d->charging.current` is always zero. Refloat's charging subsystem has nothing to measure.

## Root Cause

**Hardware topology:** The wall charger is wired directly to the battery pack, not through the VESC. The VESC only sees current that flows through its motor controller (drive current + regen). The charger is electrically invisible to the VESC and therefore to Refloat.

```
Wall charger ──────► Battery
                         │
                       VESC ──► Motor
```

## Potential Future Paths

- **BMS CAN data:** Some BMSs expose charging current/voltage over CAN. If the BMS is connected to the VESC's CAN bus, Refloat could potentially read this and populate `d->charging.current`. This would require BMS CAN support in both the BMS firmware and Refloat.
- **Dedicated charge-detect pin:** Some boards wire a GPIO to the VESC that goes high when a charger is plugged in. Refloat can read this and set state 14 (CHARGING). This board does not have this wiring.
- **Voltage trend heuristic:** Detect rising battery voltage over a short window while the board is stationary. **Rejected** — considered a hack; not reliable across different battery states.

## Current State

All mode 4 changes were reverted. Poll mode is back to `2`. No charging indicator is shown in the UI. The mode 4 infrastructure can be re-added when a reliable data source becomes available.
