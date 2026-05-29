package expo.modules.vescble.notification

import android.app.Notification
import expo.modules.vescble.LocationSnapshot
import expo.modules.vescble.RefloatTelemetry
import expo.modules.vescble.VescNotificationController
import kotlin.math.abs

internal class NotificationPresenter(
    private val controller: VescNotificationController,
    private val deviceName: () -> String?,
    private val appInForeground: () -> Boolean,
) {
    fun show(text: String = DEFAULT_TEXT, shortCriticalText: String? = null) {
        controller.show(text, deviceName(), appInForeground(), shortCriticalText)
    }

    fun build(text: String = DEFAULT_TEXT): Notification {
        return controller.build(text, deviceName(), appInForeground(), null)
    }

    companion object {
        const val DEFAULT_TEXT = "Monitoring board in background"

        fun formatNotificationText(values: RefloatTelemetry): String {
            if (values.hasFault) return "Fault ${values.faultCode}"
            val dutyPercent = if (abs(values.dutyCycle) <= 0.01) 0.0 else values.dutyCycle * 100.0
            return String.format(
                "%.1f km/h | %.0f%% duty | %.1fV",
                abs(values.speed),
                dutyPercent,
                values.batteryVoltage,
            )
        }

        fun formatBatteryVoltageChipText(values: RefloatTelemetry): String =
            if (values.hasFault) "FAULT" else String.format("%.1fV", values.batteryVoltage)

        fun formatGpsNotificationText(location: LocationSnapshot): String {
            val speedKmh = (location.speedMps ?: 0.0) * 3.6
            return String.format("GPS %.1f km/h", abs(speedKmh))
        }
    }
}
