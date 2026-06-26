package expo.modules.vescble.notification

import android.app.Notification
import expo.modules.vescble.BoardPhase
import expo.modules.vescble.RefloatTelemetry
import expo.modules.vescble.VescNotificationController
import expo.modules.vescble.displayText

internal class NotificationPresenter(
    private val controller: VescNotificationController,
    private val deviceName: () -> String?,
    private val sessionActive: () -> Boolean,
    private val canConnect: () -> Boolean,
) {
    fun show(
        phase: BoardPhase,
        telemetry: RefloatTelemetry? = null,
        batteryPercent: Double? = null,
        errorMessage: String? = null,
    ) {
        val text = resolveText(phase, telemetry, batteryPercent, errorMessage)
        val chip = NotificationFormatter.formatShortCriticalText(phase, telemetry, batteryPercent)
        controller.show(text, deviceName(), chip, batteryPercent?.toInt(), sessionActive(), canConnect())
    }

    fun build(
        phase: BoardPhase,
        telemetry: RefloatTelemetry? = null,
        batteryPercent: Double? = null,
        errorMessage: String? = null,
    ): Notification {
        val text = resolveText(phase, telemetry, batteryPercent, errorMessage)
        val chip = NotificationFormatter.formatShortCriticalText(phase, telemetry, batteryPercent)
        return controller.build(text, deviceName(), chip, batteryPercent?.toInt(), sessionActive(), canConnect())
    }

    private fun resolveText(
        phase: BoardPhase,
        telemetry: RefloatTelemetry?,
        batteryPercent: Double?,
        errorMessage: String?,
    ): String = when {
        phase == BoardPhase.Connected && telemetry != null ->
            NotificationFormatter.formatTelemetryText(telemetry, batteryPercent)
        phase == BoardPhase.Error && errorMessage != null -> errorMessage
        else -> phase.displayText()
    }
}
