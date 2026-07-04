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
        val presentation = NotificationPresentation.resolve(phase, telemetry, batteryPercent, errorMessage)
        controller.show(
            presentation.text,
            deviceName(),
            presentation.shortCriticalText,
            presentation.batteryProgressPercent,
            sessionActive() && presentation.canDisconnect,
            canConnect(),
        )
    }

    fun build(
        phase: BoardPhase,
        telemetry: RefloatTelemetry? = null,
        batteryPercent: Double? = null,
        errorMessage: String? = null,
    ): Notification {
        val presentation = NotificationPresentation.resolve(phase, telemetry, batteryPercent, errorMessage)
        return controller.build(
            presentation.text,
            deviceName(),
            presentation.shortCriticalText,
            presentation.batteryProgressPercent,
            sessionActive() && presentation.canDisconnect,
            canConnect(),
        )
    }
}

internal data class NotificationPresentation(
    val text: String,
    val shortCriticalText: String?,
    val batteryProgressPercent: Int?,
    val canDisconnect: Boolean,
) {
    companion object {
        fun resolve(
            phase: BoardPhase,
            telemetry: RefloatTelemetry? = null,
            batteryPercent: Double? = null,
            errorMessage: String? = null,
        ): NotificationPresentation {
            val visibleTelemetry = telemetry.takeIf { phase == BoardPhase.Connected }
            val visibleBatteryPercent = batteryPercent.takeIf { phase == BoardPhase.Connected }
            return NotificationPresentation(
                text = resolveText(phase, visibleTelemetry, visibleBatteryPercent, errorMessage),
                shortCriticalText = NotificationFormatter.formatShortCriticalText(
                    phase,
                    visibleTelemetry,
                    visibleBatteryPercent,
                ),
                batteryProgressPercent = visibleBatteryPercent?.toInt(),
                canDisconnect = phase.isNotificationSessionActive(),
            )
        }
    }
}

private fun BoardPhase.isNotificationSessionActive(): Boolean = when (this) {
    BoardPhase.Connected,
    BoardPhase.Connecting,
    BoardPhase.Discovering,
    BoardPhase.Subscribing,
    BoardPhase.WaitingForTelemetry -> true
    BoardPhase.Idle,
    BoardPhase.Stale,
    BoardPhase.Reconnecting,
    BoardPhase.Rescanning,
    BoardPhase.Disconnecting,
    BoardPhase.Error -> false
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
    phase.isNotificationDisconnected() -> BoardPhase.Idle.displayText()
    else -> phase.displayText()
}

private fun BoardPhase.isNotificationDisconnected(): Boolean = when (this) {
    BoardPhase.Idle,
    BoardPhase.Stale,
    BoardPhase.Reconnecting,
    BoardPhase.Rescanning,
    BoardPhase.Disconnecting -> true
    BoardPhase.Connecting,
    BoardPhase.Discovering,
    BoardPhase.Subscribing,
    BoardPhase.WaitingForTelemetry,
    BoardPhase.Connected,
    BoardPhase.Error -> false
}
