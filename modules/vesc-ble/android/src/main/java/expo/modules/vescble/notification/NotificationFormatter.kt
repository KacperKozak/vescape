package expo.modules.vescble.notification

import expo.modules.vescble.BoardPhase
import expo.modules.vescble.RefloatTelemetry
import expo.modules.vescble.displayText
import expo.modules.vescble.formatValueWithUnit
import expo.modules.vescble.shortCriticalSymbol
import expo.modules.vescble.telemetryMetricByControlId
import kotlin.math.abs
import kotlin.math.roundToInt

internal object NotificationFormatter {
    private const val SEP = " • "

    fun formatTelemetryText(values: RefloatTelemetry, batteryPercent: Double?): String {
        val speed = telemetryMetricByControlId["speed"]!!.formatValueWithUnit(abs(values.speed))
        val dutyRaw = if (abs(values.dutyCycle) <= 0.01) 0.0 else values.dutyCycle * 100.0
        val duty = telemetryMetricByControlId["duty"]!!.formatValueWithUnit(dutyRaw)
        val battery = formatBatterySegment(values.batteryVoltage, batteryPercent)
        val latency = if (values.avgLatency != null) "${values.avgLatency}ms" else ""
        return listOf(speed, duty, battery, latency).filter { it.isNotEmpty() }.joinToString(SEP)
    }

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
