package expo.modules.vescble

import android.annotation.SuppressLint
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import expo.modules.vescble.recording.RecordingCoordinator
import expo.modules.vescble.telemetry.AppDataRepository
import expo.modules.vescble.telemetry.DEFAULT_LIVE_HISTORY_LIMIT_MINUTES
import expo.modules.vescble.telemetry.MAX_LIVE_HISTORY_LIMIT_MINUTES
import expo.modules.vescble.telemetry.MIN_LIVE_HISTORY_LIMIT_MINUTES
import expo.modules.vescble.telemetry.TelemetryRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

internal const val VESC_SESSION_TAG = "VescSession"
private const val ACTION_START_SESSION = "expo.modules.vescble.ACTION_START_SESSION"
private const val ACTION_STOP_SESSION = "expo.modules.vescble.ACTION_STOP_SESSION"
internal const val ACTION_EXIT_FROM_NOTIFICATION = "expo.modules.vescble.ACTION_EXIT_FROM_NOTIFICATION"
internal const val ACTION_CONNECT_FROM_NOTIFICATION = "expo.modules.vescble.ACTION_CONNECT_FROM_NOTIFICATION"
internal const val ACTION_DISCONNECT_FROM_NOTIFICATION = "expo.modules.vescble.ACTION_DISCONNECT_FROM_NOTIFICATION"
private const val ACTION_START_GPS_MONITORING = "expo.modules.vescble.ACTION_START_GPS_MONITORING"
private const val ACTION_STOP_GPS_MONITORING = "expo.modules.vescble.ACTION_STOP_GPS_MONITORING"

internal const val TELEMETRY_STALE_MS = 4_000L

data class SessionConfig(
    val appBoardId: String?,
    val deviceId: String?,
    val deviceName: String,
    val transport: BoardTransport?,
    /** Probe-confirmed smart-BMS presence. `null` = unknown (legacy link) → still polled. */
    val hasBms: Boolean? = null,
    val pollIntervalMs: Long,
    val recordingEnabled: Boolean,
    val telemetryRecordingEnabled: Boolean,
    val autoReconnect: Boolean = false,
)

internal data class PendingStart(
    val boardConfig: SessionConfig,
    val onSuccess: () -> Unit,
    val onError: (String, String) -> Unit,
)

internal data class PendingStop(val onSuccess: () -> Unit)

/**
 * Thin Android [Service] shell. Owns lifecycle (foreground notification, START/STOP intents) and the
 * static JS bridge, delegating all durable session state and orchestration to [BoardSessionController].
 */
@SuppressLint("MissingPermission")
class VescForegroundService : Service() {
    companion object {
        var emitEvent: ((String, Map<String, Any?>) -> Unit)? = null

        private var instance: VescForegroundService? = null
        internal var pendingStart: PendingStart? = null
        internal var pendingStop: PendingStop? = null
        internal var pendingConfigRead: PendingConfigRead? = null
        internal var pendingConfigWrite: PendingConfigWrite? = null
        internal var pendingGpsStart = false
        internal val appDataScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

        // start/stop/gps requests are dispatched twice: synchronously by the caller thread and
        // again on the main thread via onStartCommand. Claim atomically so only one path wins,
        // otherwise the pending promise settles twice and crashes the service.
        private val pendingLock = Any()

        internal fun claimPendingStart(): PendingStart? = synchronized(pendingLock) {
            pendingStart.also { pendingStart = null }
        }

        internal fun claimPendingStop(): PendingStop? = synchronized(pendingLock) {
            pendingStop.also { pendingStop = null }
        }

        internal fun claimPendingGpsStart(): Boolean = synchronized(pendingLock) {
            pendingGpsStart.also { pendingGpsStart = false }
        }

        fun startBoardSession(
            context: Context,
            boardConfig: SessionConfig,
            onSuccess: () -> Unit,
            onError: (String, String) -> Unit,
        ) {
            pendingStart = PendingStart(boardConfig, onSuccess, onError)
            val intent = Intent(context, VescForegroundService::class.java).apply {
                action = ACTION_START_SESSION
            }
            context.startForegroundService(intent)
            instance?.controller?.consumePendingStart()
        }

        fun stopBoardSession(context: Context, onSuccess: () -> Unit = {}) {
            pendingStop = PendingStop(onSuccess)
            val intent = Intent(context, VescForegroundService::class.java).apply {
                action = ACTION_STOP_SESSION
            }
            context.startService(intent)
            instance?.controller?.consumePendingStop()
        }

        fun exitApp(context: Context) {
            instance?.controller?.exitFromNotification()
                ?: VescNotificationController.closeAppTask(context.applicationContext)
        }

        fun getRefloatConfigSnapshot(
            onSuccess: (Map<String, Any?>) -> Unit,
            onError: (String, String) -> Unit,
        ) {
            val service = instance
            if (service == null) {
                onError(
                    RefloatConfigErrorCode.BOARD_NOT_CONNECTED.name,
                    "Board must be connected before reading Refloat config",
                )
                return
            }
            pendingConfigRead = PendingConfigRead(onSuccess, onError)
            service.controller.consumePendingConfigRead()
        }

        fun setRemoteTilt(value: Int): Boolean = instance?.controller?.setRemoteTilt(value) ?: false

        fun lockRemoteTilt(value: Int): Boolean = instance?.controller?.lockRemoteTilt(value) ?: false

        fun releaseRemoteTilt(value: Int, durationMs: Long): Boolean =
            instance?.controller?.releaseRemoteTilt(value, durationMs) ?: false

        fun stopRemoteTilt(): Boolean = instance?.controller?.stopRemoteTilt() ?: false

        fun pushProfileToBoard(
            context: Context,
            profileId: String,
            onSuccess: (Map<String, Any?>) -> Unit,
            onError: (String, String) -> Unit,
        ) {
            val service = instance
            if (service == null) {
                onError(
                    RefloatConfigErrorCode.BOARD_NOT_CONNECTED.name,
                    "Board must be connected before pushing config",
                )
                return
            }
            pendingConfigWrite = PendingConfigWrite(profileId, onSuccess, onError)
            service.controller.consumePendingConfigWrite()
        }

        fun startGpsMonitoring(context: Context) {
            pendingGpsStart = true
            val intent = Intent(context, VescForegroundService::class.java).apply {
                action = ACTION_START_GPS_MONITORING
            }
            context.startForegroundService(intent)
            instance?.controller?.consumePendingGpsStart()
        }

        fun stopGpsMonitoring(context: Context) {
            pendingGpsStart = false
            val intent = Intent(context, VescForegroundService::class.java).apply {
                action = ACTION_STOP_GPS_MONITORING
            }
            context.startService(intent)
            instance?.controller?.stopGpsMonitoring()
        }

        fun setTelemetryRecordingEnabled(context: Context, enabled: Boolean) {
            RecordingCoordinator.requestTelemetryRecording(enabled)
            instance?.controller?.setTelemetryRecordingEnabled(enabled)
            if (!enabled) TelemetryRepository.get(context.applicationContext).flushBlocking()
        }

        fun setLiveHistoryLimit(limit: Number?) {
            val minutes = (limit?.toInt() ?: DEFAULT_LIVE_HISTORY_LIMIT_MINUTES)
                .coerceIn(MIN_LIVE_HISTORY_LIMIT_MINUTES, MAX_LIVE_HISTORY_LIMIT_MINUTES)
            instance?.controller?.applyLiveHistoryLimitMinutes(minutes)
        }

        fun reloadTelemetrySettings(context: Context) {
            appDataScope.launch {
                instance?.controller?.loadTelemetrySettings(context.applicationContext)
            }
        }

        fun reloadAlertRules(context: Context) {
            appDataScope.launch {
                instance?.controller?.loadAlertRules(context.applicationContext)
            }
        }

        fun reloadBatteryConfig() {
            appDataScope.launch {
                instance?.controller?.reloadBatteryConfigForActiveBoard()
            }
        }

        fun previewAlertSound(context: Context, soundType: String) {
            instance?.controller?.previewAlertSound(soundType) ?: VescAlertFeedback.preview(context, soundType)
        }

        fun alertSoundPresets(): List<Map<String, Any>> = alertSoundPresetMaps()

        fun currentLiveState(context: Context): Map<String, Any?> =
            instance?.controller?.liveStateMap(includeRecent = true)
                ?: idleState(AppDataRepository.get(context.applicationContext))

        fun currentRemoteTiltState(): Map<String, Any?>? = instance?.controller?.remoteTiltState()

        private fun idleState(repository: AppDataRepository): Map<String, Any?> {
            val settings = kotlinx.coroutines.runBlocking { repository.getTypedSettings() }
            return mapOf(
                "board" to mapOf(
                    "phase" to "idle",
                    "selectedBoardId" to settings.selectedBoardId,
                    "connectedBoardId" to null,
                    "bleId" to null,
                    "name" to null,
                    "connectionSeq" to 0L,
                    "lastTelemetryAt" to null,
                    "recentTelemetry" to emptyList<Map<String, Any?>>(),
                    "error" to null,
                    "autoConnect" to settings.autoConnect,
                    "remoteTilt" to null,
                ),
                "gps" to mapOf(
                    "phase" to "idle",
                    "latestFix" to null,
                    "latestApproximateFix" to null,
                    "latestPreciseFix" to null,
                    "recentLocations" to emptyList<Map<String, Any?>>(),
                    "error" to null,
                ),
                "scan" to mapOf(
                    "phase" to "idle",
                    "devices" to emptyList<Map<String, Any?>>(),
                    "error" to null,
                ),
                "recording" to mapOf(
                    "enabled" to false,
                    "activeBoardId" to null,
                    "startedAt" to null,
                ),
            )
        }
    }

    internal lateinit var controller: BoardSessionController
        private set

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        controller = BoardSessionController(this)
        instance = this
        controller.onCreate()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SESSION -> controller.consumePendingStart()
            ACTION_STOP_SESSION -> controller.consumePendingStop()
            ACTION_EXIT_FROM_NOTIFICATION -> controller.exitFromNotification()
            ACTION_CONNECT_FROM_NOTIFICATION -> controller.connectSelectedBoardFromNotification()
            ACTION_DISCONNECT_FROM_NOTIFICATION -> controller.disconnectFromNotification()
            ACTION_START_GPS_MONITORING -> controller.consumePendingGpsStart()
            ACTION_STOP_GPS_MONITORING -> controller.stopGpsMonitoring()
            else -> controller.stopIfIdle()
        }
        return if (controller.isStopping) START_NOT_STICKY else START_STICKY
    }

    override fun onDestroy() {
        controller.onServiceDestroy()
        instance = null
        super.onDestroy()
    }
}
