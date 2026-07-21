package expo.modules.vescapecore.notification

import expo.modules.vescapecore.telemetry.formatValueWithUnit

import expo.modules.vescapecore.connection.shortCriticalSymbol

import expo.modules.vescapecore.protocol.RefloatTelemetry

import expo.modules.vescapecore.connection.BoardPhase
import expo.modules.vescapecore.telemetry.telemetryMetricByControlId
import kotlin.math.roundToInt

// @parity /modules/vescape-core/ios/notification/RideActivityContent.swift
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
