package expo.modules.vescble

internal data class TelemetryMetricDef(
    val controlId: String,
    val unit: String,
    val decimals: Int,
    val alertAbove: Boolean = true,
)

// @parity /modules/vesc-ble/ios/alerts/AlertEngine.swift `telemetryMetricDefs`

internal val TELEMETRY_METRIC_DEFS = listOf(
    TelemetryMetricDef("speed",           "km/h", 0),
    TelemetryMetricDef("battery",         "V",    1, alertAbove = false),
    TelemetryMetricDef("duty",            "%",    0),
    TelemetryMetricDef("motor-temp",      "°C",   0),
    TelemetryMetricDef("motor-current",   "A",    0),
    TelemetryMetricDef("controller-temp", "°C",   0),
    TelemetryMetricDef("batt-current",    "A",    0),
    TelemetryMetricDef("imu",             "°",    1),
)

internal val telemetryMetricByControlId: Map<String, TelemetryMetricDef> =
    TELEMETRY_METRIC_DEFS.associateBy { it.controlId }

internal fun TelemetryMetricDef.formatValue(value: Double): String =
    if (decimals == 0) "%.0f".format(value) else "%.${decimals}f".format(value)

internal fun TelemetryMetricDef.formatValueWithUnit(value: Double): String =
    "${formatValue(value)}$unit"
