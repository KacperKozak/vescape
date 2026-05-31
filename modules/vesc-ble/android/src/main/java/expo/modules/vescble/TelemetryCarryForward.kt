package expo.modules.vescble

internal class TelemetryCarryForward {
    private var tempMotor: Double? = null
    private var tempMosfet: Double? = null
    private var odometer: Double? = null

    fun updateAndPatch(parsed: RefloatTelemetry): RefloatTelemetry {
        if (parsed.tempMotor != null) tempMotor = parsed.tempMotor
        if (parsed.tempMosfet != null) tempMosfet = parsed.tempMosfet
        if (parsed.odometer != null) odometer = parsed.odometer

        return parsed.copy(
            tempMotor = parsed.tempMotor ?: tempMotor,
            tempMosfet = parsed.tempMosfet ?: tempMosfet,
            odometer = parsed.odometer ?: odometer,
        )
    }

    fun reset() {
        tempMotor = null
        tempMosfet = null
        odometer = null
    }
}
