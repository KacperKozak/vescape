package expo.modules.vescble

import org.json.JSONObject

/**
 * Single source of every Board Warning kind slug. Detectors reference these instead of holding their
 * own per-detector constants, and the registry's typed report path accepts them, so a mistyped kind
 * is a compile error rather than a warning that silently renders as a raw slug. The [wire] string is
 * what crosses the bridge and is stored durably; it must stay in lockstep with the JS `BoardWarningKind`
 * union in `modules/vesc-ble/src/index.ts`.
 *
 * @parity /modules/vesc-ble/ios/telemetry/BoardWarningKind.swift
 */
enum class BoardWarningKind(val wire: String) {
  CELL_SPREAD("cell-spread"),
  BATTERY_CONFIG_MISMATCH("battery-config-mismatch"),
  FOOTPAD_DISABLED("footpad-disabled"),
  LV_PUSHBACK_LOW("lv-pushback-low"),
  HV_PUSHBACK_HIGH("hv-pushback-high"),
  DUTY_PUSHBACK_HIGH("duty-pushback-high"),
  MOVING_FAULT_DISABLED("moving-fault-disabled"),
}

/**
 * Round a payload number to 4 decimals before it is serialized, so raw float noise (e.g. a
 * `3.92 - 3.80` subtraction that lands on `0.11999999999999988`) never reaches the wire and the
 * emitted value stays stable across detections.
 */
internal fun boardWarningRound4(value: Double): Double = Math.round(value * 10_000.0) / 10_000.0

/** Build a Board Warning payload JSON string via [JSONObject], never hand-assembled strings. */
internal fun boardWarningPayload(build: JSONObject.() -> Unit): String =
  JSONObject().apply(build).toString()
