package expo.modules.vescble

internal enum class BoardPhase(val wireValue: String) {
    Idle("idle"),
    Connecting("connecting"),
    Discovering("discovering"),
    Subscribing("subscribing"),
    WaitingForTelemetry("waiting_for_telemetry"),
    Connected("connected"),
    Stale("stale"),
    Reconnecting("reconnecting"),
    Disconnecting("disconnecting"),
    Error("error"),
}

internal fun BoardPhase.recordName(): String = wireValue
