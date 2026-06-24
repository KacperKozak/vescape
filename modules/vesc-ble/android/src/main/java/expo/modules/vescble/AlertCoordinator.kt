package expo.modules.vescble

import expo.modules.vescble.telemetry.AlertRuleEntity

internal class AlertCoordinator(private val feedback: () -> VescAlertFeedback) {
    private val engine = VescAlertEngine()
    private var rules: List<AlertRuleEntity> = emptyList()
    private var activeGeigerRuleIds: Set<String> = emptySet()

    fun replaceRules(value: List<AlertRuleEntity>) {
        rules = value
        engine.resetDebounce()
    }

    fun evaluate(
        telemetry: RefloatTelemetry,
        batteryPercent: Double?,
        onDiagnostic: (String, Map<String, Any?>) -> Unit,
    ): List<Map<String, Any?>> {
        val fired = engine.evaluate(rules, telemetry, batteryPercent)
        for (alert in fired) {
            if (alert.controlId == "battery" && alert.rangeDepth == null) {
                onDiagnostic("battery_alert_fired", mapOf(
                    "rule_id" to alert.ruleId,
                    "used_ir_compensated_percent" to (batteryPercent != null),
                    "battery_percent" to batteryPercent,
                    "battery_voltage" to telemetry.batteryVoltage,
                    "battery_current" to telemetry.batteryCurrent,
                    "threshold" to alert.threshold,
                    "threshold_max" to alert.thresholdMax,
                ))
            }
        }
        val geiger = fired.filter { it.rangeDepth != null }
        val ids = geiger.mapTo(HashSet()) { it.ruleId }
        for (ruleId in activeGeigerRuleIds - ids) feedback().stopGeiger(ruleId)
        activeGeigerRuleIds = ids
        for (alert in geiger) feedback().updateGeiger(alert.ruleId, alert.soundType, alert.rangeDepth ?: 0.0)

        val single = fired.filter { it.rangeDepth == null }
        if (single.isNotEmpty()) {
            single.firstOrNull { it.soundType.startsWith("tts:") && it.thresholdMax == null }?.let { alert ->
                val text = renderAlertMessageTemplate(alert.soundType.removePrefix("tts:"), alert, batteryPercent, onDiagnostic)
                if (text.isNotEmpty()) feedback().speakMessage(text)
            }
            for (alert in single) if (!alert.soundType.startsWith("tts:")) feedback().playSingle(alert.soundType)
            feedback().vibrate(null)
        }
        return fired.map { it.toMap() }
    }

    fun stopAllGeiger() {
        feedback().stopAllGeiger()
        activeGeigerRuleIds = emptySet()
    }
}
