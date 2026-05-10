package expo.modules.vescble

data class RefloatTelemetry(
    val hasFault: Boolean,
    val faultCode: Int,
    val pitch: Double,
    val roll: Double,
    val balancePitch: Double,
    val balanceCurrent: Double,
    val speed: Double,
    val batteryVoltage: Double,
    val motorCurrent: Double,
    val batteryCurrent: Double,
    val erpm: Int,
    val dutyCycle: Double,
    val state: Int,
    val switchState: Int,
    val adc1: Double,
    val adc2: Double,
    val odometer: Double?,
    val tempMosfet: Double?,
    val tempMotor: Double?,
    val avgLatency: Int?,
    val lastPacketAt: Long,
    val location: LocationSnapshot?,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "hasFault" to hasFault,
        "faultCode" to faultCode,
        "pitch" to pitch,
        "roll" to roll,
        "balancePitch" to balancePitch,
        "balanceCurrent" to balanceCurrent,
        "speed" to speed,
        "batteryVoltage" to batteryVoltage,
        "motorCurrent" to motorCurrent,
        "batteryCurrent" to batteryCurrent,
        "erpm" to erpm,
        "dutyCycle" to dutyCycle,
        "state" to state,
        "stateName" to stateName(state),
        "switchState" to switchState,
        "adc1" to adc1,
        "adc2" to adc2,
        "odometer" to odometer,
        "tempMosfet" to tempMosfet,
        "tempMotor" to tempMotor,
        "avgLatency" to avgLatency,
        "lastPacketAt" to lastPacketAt,
        "location" to location?.toMap(),
    )
}

data class LocationSnapshot(
    val latitude: Double,
    val longitude: Double,
    val speedMps: Double?,
    val bearingDeg: Double?,
    val accuracyM: Double?,
    val altitudeM: Double?,
    val timestamp: Long,
    val precise: Boolean,
    val saved: Boolean,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "latitude" to latitude,
        "longitude" to longitude,
        "speedMps" to speedMps,
        "bearingDeg" to bearingDeg,
        "accuracyM" to accuracyM,
        "altitudeM" to altitudeM,
        "timestamp" to timestamp,
        "precise" to precise,
        "saved" to saved,
    )
}

private fun stateName(state: Int): String {
    return when (state and 0x0f) {
        0 -> "STARTUP"
        1 -> "RUNNING"
        2 -> "TILTBACK"
        3 -> "WHEELSLIP"
        4 -> "UPSIDEDOWN"
        5 -> "FLYWHEEL"
        6 -> "FAULT_PITCH"
        7 -> "FAULT_ROLL"
        8 -> "FAULT_SW_HALF"
        9 -> "FAULT_SW_FULL"
        11 -> "FAULT_STARTUP"
        12 -> "FAULT_REVERSE"
        13 -> "FAULT_QUICKSTOP"
        14 -> "CHARGING"
        15 -> "DISABLED"
        else -> "UNKNOWN"
    }
}
