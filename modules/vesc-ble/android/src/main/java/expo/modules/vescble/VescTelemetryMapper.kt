package expo.modules.vescble

import android.os.SystemClock
import expo.modules.vescble.telemetry.TelemetryCapture
import expo.modules.vescble.telemetry.TelemetryLocationCapture

internal fun RefloatTelemetry.toCapture(session: SessionConfig, canId: Int?): TelemetryCapture =
    TelemetryCapture(
        capturedAtMs = lastPacketAt,
        elapsedRealtimeMs = SystemClock.elapsedRealtime(),
        deviceId = session.deviceId,
        deviceName = session.deviceName,
        canId = canId,
        hasFault = hasFault,
        faultCode = faultCode,
        pitch = pitch,
        roll = roll,
        balancePitch = balancePitch,
        balanceCurrent = balanceCurrent,
        speed = speed,
        batteryVoltage = batteryVoltage,
        motorCurrent = motorCurrent,
        batteryCurrent = batteryCurrent,
        erpm = erpm,
        dutyCycle = dutyCycle,
        state = state,
        switchState = switchState,
        adc1 = adc1,
        adc2 = adc2,
        odometer = odometer,
        tempMosfet = tempMosfet,
        tempMotor = tempMotor,
        avgLatency = avgLatency,
        location = location?.takeIf { it.precise }?.toCapture(),
    )

internal fun LocationSnapshot.toCapture(): TelemetryLocationCapture =
    TelemetryLocationCapture(
        latitude = latitude,
        longitude = longitude,
        speedMps = speedMps,
        bearingDeg = bearingDeg,
        accuracyM = accuracyM,
        altitudeM = altitudeM,
        timestamp = timestamp,
        precise = precise,
    )
