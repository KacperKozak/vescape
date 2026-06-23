package expo.modules.vescble

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat

internal class VescNotificationController(
    private val service: Service,
    private val serviceClass: Class<*>,
    private val channelId: String,
    private val notificationId: Int,
    private val stopAction: String,
) {
    fun createChannel() {
        val channel = NotificationChannel(
            channelId,
            "VESC Board Monitoring",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Shows while monitoring board and GPS data"
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
        }
        service.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    fun show(
        text: String,
        deviceName: String?,
        appInForeground: Boolean,
        shortCriticalText: String?,
        batteryPercent: Int? = null,
    ) {
        service.getSystemService(NotificationManager::class.java)
            .notify(notificationId, build(text, deviceName, appInForeground, shortCriticalText, batteryPercent))
    }

    fun cancel() {
        service.getSystemService(NotificationManager::class.java).cancel(notificationId)
    }

    fun build(
        text: String,
        deviceName: String?,
        appInForeground: Boolean,
        shortCriticalText: String?,
        batteryPercent: Int? = null,
    ): Notification {
        val title = (deviceName ?: "VESC").let { if (appInForeground) it else "$it (bg)" }
        return NotificationCompat.Builder(service, channelId)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_vesc_notification)
            .setContentIntent(buildOpenAppIntent())
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setRequestPromotedOngoing(true)
            .setShortCriticalText(shortCriticalText ?: "—")
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .apply {
                if (batteryPercent != null) setProgress(100, batteryPercent.coerceIn(0, 100), false)
            }
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Exit",
                buildStopIntent(),
            )
            .build()
            .apply {
                flags = flags or Notification.FLAG_ONGOING_EVENT or Notification.FLAG_NO_CLEAR
            }
    }

    fun closeAppTask() {
        try {
            service.getSystemService(ActivityManager::class.java)
                ?.appTasks
                ?.forEach { it.finishAndRemoveTask() }
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "App task cleanup failed: ${e.message}")
        }
    }

    private fun buildStopIntent(): PendingIntent {
        val intent = Intent(service, serviceClass).apply {
            action = stopAction
        }
        return PendingIntent.getService(
            service,
            1,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    private fun buildOpenAppIntent(): PendingIntent {
        val intent = service.packageManager.getLaunchIntentForPackage(service.packageName) ?: Intent()
        return PendingIntent.getActivity(
            service,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }
}
