package expo.modules.vescble.notification

import expo.modules.vescble.BoardPhase
import expo.modules.vescble.RefloatTelemetry
import expo.modules.vescble.displayText
import expo.modules.vescble.formatValueWithUnit
import expo.modules.vescble.shortCriticalSymbol
import expo.modules.vescble.telemetryMetricByControlId
import kotlin.math.roundToInt

internal object NotificationFormatter {
    fun formatTelemetryText(values: RefloatTelemetry, batteryPercent: Double?): String =
        formatBatterySegment(values.batteryVoltage, batteryPercent)

    fun formatShortCriticalText(phase: BoardPhase, values: RefloatTelemetry?, batteryPercent: Double?): String =
        when (phase) {
            BoardPhase.Connected -> {
                if (batteryPercent != null) "${batteryPercent.roundToInt()}%"
                else if (values != null) telemetryMetricByControlId["battery"]!!.formatValueWithUnit(values.batteryVoltage)
                else phase.shortCriticalSymbol()
            }
            else -> phase.shortCriticalSymbol()
        }

    private fun formatBatterySegment(voltage: Double, batteryPercent: Double?): String {
        val voltStr = telemetryMetricByControlId["battery"]!!.formatValueWithUnit(voltage)
        return if (batteryPercent != null) "${batteryPercent.roundToInt()}% ($voltStr)" else voltStr
    }
}
