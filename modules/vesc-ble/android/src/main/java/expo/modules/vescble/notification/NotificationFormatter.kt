package expo.modules.vescble.notification

import expo.modules.vescble.BoardPhase
import expo.modules.vescble.RefloatTelemetry
import expo.modules.vescble.displayText
import expo.modules.vescble.shortCriticalSymbol
import kotlin.math.abs
import kotlin.math.roundToInt

internal object NotificationFormatter {
    private const val SEP = " • "

    fun formatTelemetryText(values: RefloatTelemetry, batteryPercent: Double?): String {
        val speed = "${abs(values.speed).roundToInt()}km/h"
        val dutyPercent = if (abs(values.dutyCycle) <= 0.01) 0 else (values.dutyCycle * 100.0).roundToInt()
        val duty = "${dutyPercent}%"
        val battery = formatBatterySegment(values.batteryVoltage, batteryPercent)
        return "$speed$SEP$duty$SEP$battery"
    }

    fun formatShortCriticalText(phase: BoardPhase, values: RefloatTelemetry?, batteryPercent: Double?): String =
        when (phase) {
            BoardPhase.Connected -> {
                if (batteryPercent != null) "${batteryPercent.roundToInt()}%"
                else if (values != null) String.format("%.1fV", values.batteryVoltage)
                else phase.shortCriticalSymbol()
            }
            else -> phase.shortCriticalSymbol()
        }

    private fun formatBatterySegment(voltage: Double, batteryPercent: Double?): String =
        if (batteryPercent != null) {
            "${batteryPercent.roundToInt()}% (${String.format("%.1fV", voltage)})"
        } else {
            String.format("%.1fV", voltage)
        }
}
