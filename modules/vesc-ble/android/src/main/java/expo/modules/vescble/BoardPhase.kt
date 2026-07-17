package expo.modules.vescble

// @parity /modules/vesc-ble/ios/connection/BoardPhase.swift `BoardPhase`
// @parity /modules/vesc-ble/src/index.ts `SessionStatus`
// @platform-diff Android also exposes Stale/Disconnecting for foreground-service notification and
// stale-telemetry reporting windows; iOS documents those as accepted wire differences on its enum.
internal enum class BoardPhase(val wireValue: String) {
    Idle("idle"),
    Connecting("connecting"),
    Discovering("discovering"),
    Subscribing("subscribing"),
    WaitingForTelemetry("waiting_for_telemetry"),
    Connected("connected"),
    Stale("stale"),
    Reconnecting("reconnecting"),
    Rescanning("rescanning"),
    Disconnecting("disconnecting"),
    Error("error"),
}

internal fun BoardPhase.recordName(): String = wireValue

internal fun BoardPhase.displayText(): String = when (this) {
    BoardPhase.Idle -> "Board not connected"
    BoardPhase.Connecting -> "Connecting…"
    BoardPhase.Discovering -> "Discovering…"
    BoardPhase.Subscribing -> "Subscribing…"
    BoardPhase.WaitingForTelemetry -> "Waiting for telemetry…"
    BoardPhase.Connected -> "Connected"
    BoardPhase.Stale -> "Telemetry stale"
    BoardPhase.Reconnecting -> "Reconnecting…"
    BoardPhase.Rescanning -> "Searching…"
    BoardPhase.Disconnecting -> "Disconnecting…"
    BoardPhase.Error -> "Connection error"
}

internal fun BoardPhase.shortCriticalSymbol(): String = when (this) {
    BoardPhase.Idle -> "—"
    BoardPhase.Connected -> "—"
    BoardPhase.Stale -> "⚠"
    BoardPhase.Error -> "✕"
    BoardPhase.Connecting,
    BoardPhase.Discovering,
    BoardPhase.Subscribing,
    BoardPhase.WaitingForTelemetry,
    BoardPhase.Reconnecting,
    BoardPhase.Rescanning,
    BoardPhase.Disconnecting -> "…"
}
