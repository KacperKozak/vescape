package expo.modules.vescble

import android.annotation.SuppressLint
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.location.Location
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import java.io.File
import expo.modules.vescble.config.ConfigRWEffect
import expo.modules.vescble.config.ConfigRWEvent
import expo.modules.vescble.config.ConfigRWFsm
import expo.modules.vescble.config.ConfigRWState
import expo.modules.vescble.connection.ConnectPhaseTimeout
import expo.modules.vescble.connection.ConnectionCoordinator
import expo.modules.vescble.diagnostics.DiagnosticContext
import expo.modules.vescble.diagnostics.DiagnosticsRecorder
import expo.modules.vescble.notification.NotificationPresenter
import expo.modules.vescble.recording.RecordingCoordinator
import expo.modules.vescble.reconnect.RECONNECT_MAX_ATTEMPTS
import expo.modules.vescble.reconnect.ReconnectBlePort
import expo.modules.vescble.reconnect.ReconnectListener
import expo.modules.vescble.reconnect.ReconnectPolicy
import expo.modules.vescble.reconnect.ReconnectScanMatch
import expo.modules.vescble.reconnect.ReconnectScheduler
import expo.modules.vescble.runtime.BoardSession
import expo.modules.vescble.runtime.Cancellable
import expo.modules.vescble.runtime.HandlerScheduler
import expo.modules.vescble.runtime.Scheduler
import expo.modules.vescble.runtime.postDelayedForSession
import expo.modules.vescble.telemetry.AlertRuleEntity
import expo.modules.vescble.telemetry.AppDataRepository
import expo.modules.vescble.telemetry.AppSettings
import expo.modules.vescble.telemetry.BatterySocEstimator
import expo.modules.vescble.telemetry.DEFAULT_LIVE_HISTORY_LIMIT_MINUTES
import expo.modules.vescble.telemetry.MAX_LIVE_HISTORY_LIMIT_MINUTES
import expo.modules.vescble.telemetry.MIN_LIVE_HISTORY_LIMIT_MINUTES
import expo.modules.vescble.telemetry.TelemetryPipeline
import expo.modules.vescble.telemetry.TelemetryRepository
import expo.modules.vescble.telemetry.toMetricSanitizerConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

internal const val VESC_SESSION_TAG = "VescSession"
private const val CHANNEL_ID = "vesc_monitoring_v5"
private const val NOTIFICATION_ID = 1001
private const val ACTION_START_SESSION = "expo.modules.vescble.ACTION_START_SESSION"
private const val ACTION_STOP_SESSION = "expo.modules.vescble.ACTION_STOP_SESSION"
private const val ACTION_EXIT_FROM_NOTIFICATION = "expo.modules.vescble.ACTION_EXIT_FROM_NOTIFICATION"
private const val ACTION_START_GPS_MONITORING = "expo.modules.vescble.ACTION_START_GPS_MONITORING"
private const val ACTION_STOP_GPS_MONITORING = "expo.modules.vescble.ACTION_STOP_GPS_MONITORING"

private const val LAST_GPS_PERSIST_INTERVAL_MS = 30_000L
private const val TELEMETRY_STALE_MS = 4_000L
private const val GATT_CONNECT_TIMEOUT_MS = 6_000L
private const val GATT_READY_TIMEOUT_MS = 6_000L

data class SessionConfig(
    val appBoardId: String?,
    val deviceId: String?,
    val deviceName: String,
    val canId: Int?,
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

@SuppressLint("MissingPermission")
class VescForegroundService : Service() {
    companion object {
        var emitEvent: ((String, Map<String, Any?>) -> Unit)? = null

        private var instance: VescForegroundService? = null
        private var appInForeground = true
        private var pendingStart: PendingStart? = null
        private var pendingStop: PendingStop? = null
        private var pendingConfigRead: PendingConfigRead? = null
        private var pendingGpsStart = false
        private var requestedLiveHistoryLimitMinutes = DEFAULT_LIVE_HISTORY_LIMIT_MINUTES
        private val appDataScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

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
            instance?.consumePendingStart()
        }

        fun stopBoardSession(context: Context, onSuccess: () -> Unit = {}) {
            pendingStop = PendingStop(onSuccess)
            val intent = Intent(context, VescForegroundService::class.java).apply {
                action = ACTION_STOP_SESSION
            }
            context.startService(intent)
            instance?.consumePendingStop()
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
            service.consumePendingConfigRead()
        }

        private var pendingConfigWrite: PendingConfigWrite? = null

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
            service.consumePendingConfigWrite()
        }

        fun startGpsMonitoring(context: Context) {
            pendingGpsStart = true
            val intent = Intent(context, VescForegroundService::class.java).apply {
                action = ACTION_START_GPS_MONITORING
            }
            context.startForegroundService(intent)
            instance?.consumePendingGpsStart()
        }

        fun stopGpsMonitoring(context: Context) {
            pendingGpsStart = false
            val intent = Intent(context, VescForegroundService::class.java).apply {
                action = ACTION_STOP_GPS_MONITORING
            }
            context.startService(intent)
            instance?.stopGpsMonitoring()
        }

        fun setTelemetryRecordingEnabled(context: Context, enabled: Boolean) {
            RecordingCoordinator.requestTelemetryRecording(enabled)
            instance?.setTelemetryRecordingEnabled(enabled)
            if (!enabled) TelemetryRepository.get(context.applicationContext).flushBlocking()
        }

        fun setLiveHistoryLimit(limit: Number?) {
            val minutes = (limit?.toInt() ?: DEFAULT_LIVE_HISTORY_LIMIT_MINUTES)
                .coerceIn(MIN_LIVE_HISTORY_LIMIT_MINUTES, MAX_LIVE_HISTORY_LIMIT_MINUTES)
            requestedLiveHistoryLimitMinutes = minutes
            instance?.applyLiveHistoryLimitMinutes(minutes)
        }

        fun reloadTelemetrySettings(context: Context) {
            appDataScope.launch {
                instance?.loadTelemetrySettings(context.applicationContext)
            }
        }

        @Volatile private var alertRules: List<AlertRuleEntity> = emptyList()

        fun reloadAlertRules(context: Context) {
            appDataScope.launch {
                instance?.loadAlertRules(context.applicationContext)
            }
        }

        fun previewAlertSound(context: Context, soundType: String) {
            instance?.alertFeedback?.preview(soundType) ?: VescAlertFeedback.preview(context, soundType)
        }

        fun alertSoundPresets(): List<Map<String, Any>> = alertSoundPresetMaps()

        fun currentLiveState(context: Context): Map<String, Any?> =
            instance?.liveStateMap(includeRecent = true)
                ?: idleState(AppDataRepository.get(context.applicationContext))

        fun setAppInForeground(active: Boolean) {
            if (appInForeground == active) return
            appInForeground = active
            instance?.refreshNotification()
        }

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

    private data class PendingStop(val onSuccess: () -> Unit)

    private data class PendingConfigRead(
        val onSuccess: (Map<String, Any?>) -> Unit,
        val onError: (String, String) -> Unit,
    )

    private data class PendingConfigWrite(
        val profileId: String,
        val onSuccess: (Map<String, Any?>) -> Unit,
        val onError: (String, String) -> Unit,
    )

    private val mainHandler = Handler(Looper.getMainLooper())
    private val scheduler: Scheduler = HandlerScheduler(mainHandler)
    private val packetReassembler = VescPacketReassembler()
    private val pollingLoop = PollingLoop(
        scheduler = scheduler,
        isCurrentSession = ::isCurrentBoardSession,
        sendPayloadWithRetry = { payload, session -> sendPayloadWithRetry(payload, session) },
    )
    private val connectionCoordinator = ConnectionCoordinator(
        scheduler = scheduler,
        isCurrentSession = ::isCurrentBoardSession,
    )
    private val notificationController by lazy {
        VescNotificationController(
            service = this,
            serviceClass = VescForegroundService::class.java,
            channelId = CHANNEL_ID,
            notificationId = NOTIFICATION_ID,
            stopAction = ACTION_EXIT_FROM_NOTIFICATION,
        )
    }
    private val presenter by lazy {
        NotificationPresenter(
            controller = notificationController,
            deviceName = { boardConfig?.deviceName },
            appInForeground = { appInForeground },
        )
    }
    private val alertEngine = VescAlertEngine()
    private var activeGeigerRuleIds: Set<String> = emptySet()
    private val alertFeedback by lazy { VescAlertFeedback(this, mainHandler) }
    private val diagnosticsRecorder: DiagnosticsRecorder by lazy {
        DiagnosticsRecorder(
            local = { name, props ->
                TelemetryRepository.get(applicationContext).recordDiagnosticEvent(name, props)
            },
            remote = { name, props -> DiagnosticReporter.get(this).capture(name, props) },
            context = {
                DiagnosticContext(
                    phaseWire = boardStatus.wireValue,
                    connectionSeq = currentSessionId,
                    connectAttempt = connectionCoordinator.connectAttempt,
                    autoReconnectAttempt = reconnectScheduler.currentAttempt,
                    canId = canId,
                    directConnection = directConnection,
                    lastSentCommand = lastSentCommand,
                    lastReceivedCommandByte = lastReceivedCommandByte,
                    lastTelemetryAt = telemetryPipeline.lastTelemetryAt,
                )
            },
        )
    }
    private val telemetryPipeline: TelemetryPipeline = TelemetryPipeline(
        scheduler = scheduler,
        onTelemetryStale = ::onTelemetryStaleFired,
        captureBuilder = { parsed, cfg, id -> parsed.toCapture(cfg, id) },
        staleTimeoutMs = TELEMETRY_STALE_MS,
    )
    private val recordingCoordinator by lazy {
        RecordingCoordinator(
            context = applicationContext,
            applyLiveSettings = ::applyTelemetryPipelineSettings,
        )
    }
    private val gpsMonitor by lazy {
        VescGpsMonitor(
            context = this,
            looper = Looper.getMainLooper(),
            onLocation = ::onLocationUpdated,
        )
    }
    private val gattClient by lazy {
        VescGattClient(
            context = this,
            handler = mainHandler,
            recorder = { recordingCoordinator.currentRecorder() },
            listener = gattListener,
        )
    }

    private val reconnectBlePort = object : ReconnectBlePort {
        private var activeCallback: ScanCallback? = null

        override fun hasScanner(): Boolean = bluetoothAdapter.bluetoothLeScanner != null

        override fun startScan(
            targetId: String,
            onFound: (ReconnectScanMatch) -> Unit,
            onFailed: (errorCode: Int) -> Unit,
        ): Boolean {
            val scanner = bluetoothAdapter.bluetoothLeScanner ?: return false
            val cb = object : ScanCallback() {
                override fun onScanResult(callbackType: Int, result: ScanResult) {
                    if (!result.device.address.equals(targetId, ignoreCase = true)) return
                    onFound(ReconnectScanMatch(result.device.address, result.rssi))
                }

                override fun onScanFailed(errorCode: Int) {
                    onFailed(errorCode)
                }
            }
            activeCallback = cb
            scanner.startScan(
                null,
                ScanSettings.Builder()
                    .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                    .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
                    .build(),
                cb,
            )
            Log.d(VESC_SESSION_TAG, "Reconnect scan started for $targetId")
            return true
        }

        override fun stopScan() {
            val cb = activeCallback ?: return
            activeCallback = null
            try {
                bluetoothAdapter.bluetoothLeScanner?.stopScan(cb)
            } catch (e: Exception) {
                Log.w(VESC_SESSION_TAG, "Reconnect scan stop failed: ${e.message}")
            }
        }
    }

    private val reconnectListener = object : ReconnectListener {
        override fun isReconnectActive(session: BoardSession): Boolean {
            if (!session.isActive || session !== boardSession || isStoppingService) return false
            val cfg = boardConfig ?: return false
            if (!cfg.autoReconnect) return false
            return boardStatus == BoardPhase.Reconnecting || boardStatus == BoardPhase.Rescanning
        }

        override fun onAttempt(
            session: BoardSession,
            reason: String,
            gattStatus: Int?,
            nextAttempt: Int,
        ) {
            val cfg = boardConfig ?: return
            flushTelemetryDiagnostics("reconnect")
            recordingCoordinator.recordConnectionLost(
                cfg,
                telemetryPipeline.lastTelemetryAt,
                reason,
            )
            recordLocalDiagnostic(
                "reconnect_scheduled",
                cfg,
                "connect",
                mapOf(
                    "message" to reason,
                    "reason" to reason,
                    "gatt_status" to gattStatus,
                    "auto_reconnect_next_attempt" to nextAttempt,
                ),
            )
            if (reason.contains("telemetry", ignoreCase = true)) {
                captureDiagnostic(
                    if (reason.contains("stale", ignoreCase = true)) "telemetry_stale" else "telemetry_unavailable",
                    diagnosticProperties(cfg, "telemetry") + mapOf(
                        "message" to reason,
                        "reason" to reason,
                        "gatt_status" to gattStatus,
                        "auto_reconnect_enabled" to cfg.autoReconnect,
                        "last_telemetry_timestamp" to telemetryPipeline.lastTelemetryAt.takeIf { it > 0L },
                        "telemetry_parse_failed_count" to diagnosticsRecorder.telemetryParseFailedCount(),
                    ),
                )
            }
            connectionCoordinator.clearPending()
            cancelBoardReadyTimeout()
            cancelCanPingTimeout()
            stopPolling()
            gattClient.clear(markIntentional = false)
            telemetryPipeline.resetLastTelemetryAt()
            directConnection = false
            boardStatus = BoardPhase.Reconnecting
            boardError = reason
            recordingCoordinator.recordState(
                "reconnecting",
                mapOf("attempt" to nextAttempt, "status" to gattStatus),
            )
            emitState()
            presenter.show(boardStatus)
        }

        override fun onScanStart(session: BoardSession) {
            boardStatus = BoardPhase.Rescanning
            emitState()
            recordLocalDiagnostic(
                "reconnect_scan_started",
                boardConfig,
                "connect",
                mapOf("message" to "Reconnect scan started"),
            )
        }

        override fun onScanFound(session: BoardSession, match: ReconnectScanMatch) {
            recordLocalDiagnostic(
                "reconnect_scan_found",
                boardConfig,
                "connect",
                mapOf(
                    "message" to "Reconnect target found",
                    "scan_result_address" to match.address,
                    "rssi" to match.rssi,
                ),
            )
        }

        override fun onScanTimeout(session: BoardSession) {
            recordLocalDiagnostic(
                "reconnect_scan_timeout",
                boardConfig,
                "connect",
                mapOf(
                    "message" to "Reconnect scan timed out",
                    "timeout_ms" to ReconnectPolicy.scanTimeoutMs(),
                ),
            )
        }

        override fun onScanFailed(session: BoardSession, errorCode: Int) {
            Log.w(VESC_SESSION_TAG, "Reconnect scan failed errorCode=$errorCode")
            recordLocalDiagnostic(
                "reconnect_scan_failed",
                boardConfig,
                "connect",
                mapOf(
                    "message" to "Reconnect scan failed",
                    "error_code" to errorCode,
                ),
            )
        }

        override fun onScanStartFailed(session: BoardSession, error: String?) {
            Log.w(VESC_SESSION_TAG, "Reconnect scan start failed: $error")
            recordLocalDiagnostic(
                "reconnect_scan_start_failed",
                boardConfig,
                "connect",
                mapOf(
                    "message" to "Reconnect scan start failed",
                    "error_message" to error,
                ),
            )
        }

        override fun onMissingTarget(session: BoardSession) {
            // Re-schedule logs the next attempt; nothing to do here.
        }

        override fun onScannerUnavailable(session: BoardSession) {
            // Re-schedule logs the next attempt; nothing to do here.
        }

        override fun startDirectReconnect(session: BoardSession, reason: String) {
            val cfg = boardConfig ?: return
            recordLocalDiagnostic(
                "reconnect_direct_connect_started",
                cfg,
                "connect",
                mapOf(
                    "message" to "Reconnect direct connect started",
                    "reason" to reason,
                ),
            )
            connectionCoordinator.resetAttempts()
            boardError = null
            setStatus(BoardPhase.Connecting)
            startBleSession(PendingStart(cfg, onSuccess = {}, onError = { _, _ -> }))
        }

        override fun onMaxAttemptsReached(session: BoardSession, reason: String) {
            recordLocalDiagnostic(
                "reconnect_max_attempts",
                boardConfig,
                "connect",
                mapOf(
                    "message" to "Reconnect max attempts reached",
                    "reason" to reason,
                ),
            )
            setError("Reconnect failed after $RECONNECT_MAX_ATTEMPTS attempts")
            recordingCoordinator.finishDebugRecording("error")
        }
    }

    private val reconnectScheduler = ReconnectScheduler(
        scheduler = scheduler,
        port = reconnectBlePort,
        listener = reconnectListener,
    )

    private var boardConfig: SessionConfig? = null
    @Volatile
    private var batteryConfigCache: Map<String, Any?>? = null
    private var boardStatus: BoardPhase = BoardPhase.Idle
    private var boardError: String? = null
    private var telemetry: RefloatTelemetry? = null
    private var canId: Int? = null
    private var directConnection = false
    private var fwVersionString: String? = null
    private var boardReadyTimeoutHandle: Cancellable? = null
    private var gpsError: String? = null
    private var latestLocation: LocationSnapshot? = null
    private var latestPreciseLocation: LocationSnapshot? = null
    private var lastGpsPersistedAt = 0L
    private var isStoppingService = false
    private var canPingTimeoutHandle: Cancellable? = null
    private var configFsmState: ConfigRWState = ConfigRWState.Idle
    private var configReadCallbacks: PendingConfigRead? = null
    private var configWriteCallbacks: PendingConfigWrite? = null
    private var configTimeoutHandle: Cancellable? = null
    private var lastSentCommand: Int? = null
    private var lastReceivedCommandByte: Int? = null
    private var boardSession: BoardSession? = null
    private var sessionSequence: Long = 0L
    private val currentSessionId: Long get() = boardSession?.id ?: sessionSequence
    private val isPollingCapable get() = isPollingCapable(canId, directConnection)
    private val recentLocations = ArrayDeque<Map<String, Any?>>()
    private val bluetoothAdapter: BluetoothAdapter
        get() = (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        BatterySocEstimator.init(this)
        DiagnosticReporter.initialize(this)
        notificationController.createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SESSION -> consumePendingStart()
            ACTION_STOP_SESSION -> consumePendingStop()
            ACTION_EXIT_FROM_NOTIFICATION -> exitFromNotification()
            ACTION_START_GPS_MONITORING -> consumePendingGpsStart()
            ACTION_STOP_GPS_MONITORING -> stopGpsMonitoring()
            else -> if (boardConfig == null && !gpsMonitor.active) stopSelf()
        }
        return if (isStoppingService) START_NOT_STICKY else START_STICKY
    }

    override fun onDestroy() {
        if (!isStoppingService) {
            stopCurrentBoardSession(emitDisconnected = false)
        }
        alertFeedback.release()
        stopLocationUpdates()
        instance = null
        DiagnosticReporter.get(this).flush()
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    private fun consumePendingStart() {
        val start = pendingStart ?: return
        pendingStart = null
        beginSession(start)
    }

    private fun consumePendingStop() {
        val stop = pendingStop ?: return
        pendingStop = null
        if (boardConfig != null) {
            setStatus(BoardPhase.Disconnecting)
            stopCurrentBoardSession(
                emitDisconnected = true,
                updateNotification = !gpsMonitor.active,
            )
            stop.onSuccess()
            return
        }
        stop.onSuccess()
        if (!gpsMonitor.active) {
            isStoppingService = true
            stopSelf()
        }
    }

    private fun consumePendingConfigRead() {
        val pending = pendingConfigRead ?: return
        pendingConfigRead = null
        if (configFsmState !is ConfigRWState.Idle) {
            pending.onError(
                RefloatConfigErrorCode.CONFIG_REQUEST_IN_FLIGHT.name,
                "Config operation already in flight",
            )
            return
        }
        if (boardConfig == null || boardStatus != BoardPhase.Connected) {
            pending.onError(
                RefloatConfigErrorCode.BOARD_NOT_CONNECTED.name,
                "Board must be connected before reading Refloat config",
            )
            return
        }
        val currentCanId = canId
        val transport = boardTransport(currentCanId, directConnection)
        if (transport == null) {
            pending.onError(
                RefloatConfigErrorCode.CAN_ID_UNAVAILABLE.name,
                "Cannot read Refloat config before CAN id discovery",
            )
            return
        }
        val wasPolling = pollingLoop.isActive
        stopPolling()
        configReadCallbacks = pending
        dispatchConfigEvent(
            ConfigRWEvent.StartRead(
                opId = newOperationId(),
                canId = currentCanId,
                transport = transport,
                wasPolling = wasPolling,
                appBoardId = boardConfig?.appBoardId,
                fwVersion = fwVersionString,
            ),
        )
    }

    private fun consumePendingGpsStart() {
        if (!pendingGpsStart) return
        pendingGpsStart = false
        startGpsMonitoring()
    }

    private fun exitFromNotification() {
        isStoppingService = true
        stopCurrentBoardSession(emitDisconnected = true)
        stopLocationUpdates()
        closeAppTask()
        stopSelf()
    }

    private fun startGpsMonitoring() {
        isStoppingService = false
        gpsError = null
        startLocationUpdates()
        emitState()
        if (boardConfig == null) {
            startForeground(NOTIFICATION_ID, presenter.build(boardStatus))
        } else {
            presenter.show(boardStatus)
        }
    }

    private fun stopGpsMonitoring() {
        pendingGpsStart = false
        stopLocationUpdates()
        gpsError = null
        emitState()
        if (boardConfig == null) {
            isStoppingService = true
            stopSelf()
        }
    }

    private fun beginSession(start: PendingStart) {
        isStoppingService = false
        stopCurrentBoardSession(emitDisconnected = false, updateNotification = false)
        refreshLiveHistoryLimit()
        VescForegroundService.reloadAlertRules(applicationContext)
        boardConfig = start.boardConfig
        sessionSequence += 1
        val session = BoardSession(id = sessionSequence)
        boardSession = session
        canId = start.boardConfig.canId
        directConnection = false
        boardError = null
        telemetry = null
        loadBatteryConfig(start.boardConfig.appBoardId)
        telemetryPipeline.beginSession(session, start.boardConfig)
        packetReassembler.reset()
        gattClient.resetDiagnostics()
        diagnosticsRecorder.resetTelemetryParseFailedCounters()
        connectionCoordinator.reset()
        reconnectScheduler.cancelAndReset()
        recordingCoordinator.beginBoardSession(start.boardConfig)
        startLocationUpdates()
        setStatus(BoardPhase.Connecting)
        startForeground(NOTIFICATION_ID, presenter.build(boardStatus))

        startBleSession(start)
    }

    private fun startBleSession(start: PendingStart) {
        val deviceId = start.boardConfig.deviceId
        if (deviceId.isNullOrBlank()) {
            failStart(start, "INVALID_DEVICE", "Board session requires deviceId")
            return
        }
        val attempt = connectionCoordinator.markConnectStarting(start)
        reconnectScheduler.stopScan()
        val device = bluetoothAdapter.getRemoteDevice(deviceId)
        gattClient.connect(device)
        armConnectPhaseTimeout(start, "gatt_connect", GATT_CONNECT_TIMEOUT_MS)
        Log.d(
            VESC_SESSION_TAG,
            "connect start device=$deviceId attempt=$attempt autoReconnect=${start.boardConfig.autoReconnect}",
        )
        recordLocalDiagnostic(
            "ble_connect_started",
            start.boardConfig,
            "connect",
            mapOf("message" to "BLE connect started"),
        )
    }

    private val gattListener = object : VescGattListener {
        override fun onGattConnected() {
            Log.d(VESC_SESSION_TAG, "connect phase: gatt connected")
            recordLocalDiagnostic(
                "gatt_connected",
                connectionCoordinator.pendingConnect?.boardConfig ?: boardConfig,
                "connect",
                mapOf("message" to "GATT connected"),
            )
            setStatus(BoardPhase.Discovering)
            connectionCoordinator.pendingConnect?.let {
                armConnectPhaseTimeout(it, "gatt_ready", GATT_READY_TIMEOUT_MS)
            }
        }

        override fun onGattSubscribing() {
            Log.d(VESC_SESSION_TAG, "connect phase: subscribing")
            recordLocalDiagnostic(
                "gatt_subscribing",
                connectionCoordinator.pendingConnect?.boardConfig ?: boardConfig,
                "connect",
                mapOf("message" to "GATT subscribing"),
            )
            setStatus(BoardPhase.Subscribing)
        }

        override fun onGattDisconnected(status: Int, intentional: Boolean) {
            val wasConnecting = connectionCoordinator.pendingConnect
            Log.w(
                VESC_SESSION_TAG,
                "gatt disconnected status=$status intentional=$intentional wasConnecting=${wasConnecting != null} boardStatus=$boardStatus",
            )
            connectionCoordinator.cancelConnectTimeout()
            stopPolling()
            if (!intentional && configFsmState !is ConfigRWState.Idle) {
                dispatchConfigEvent(
                    ConfigRWEvent.SessionTerminated("Board disconnected during Refloat config op"),
                )
            }
            if (intentional) {
                return
            } else if (wasConnecting != null) {
                if (
                    connectionCoordinator.retryStatus133Once(
                        status = status,
                        wasConnecting = wasConnecting,
                        session = boardSession,
                        retryDelayMs = 250L,
                        restart = ::startBleSession,
                    )
                ) {
                    Log.w(VESC_SESSION_TAG, "status=133 during connect, retrying once")
                } else if (wasConnecting.boardConfig.autoReconnect) {
                    captureDiagnostic(
                        "ble_connect_failed",
                        diagnosticProperties(wasConnecting.boardConfig, "connect") + mapOf(
                            "message" to "Device disconnected during connect",
                            "error_code" to status,
                            "gatt_status" to status,
                        ),
                    )
                    scheduleAutoReconnect(wasConnecting.boardConfig, status, "connect failed")
                } else {
                    failStart(wasConnecting, "DISCONNECTED", "Device disconnected during connect (status=$status)")
                }
            } else if (boardConfig?.autoReconnect == true) {
                captureDiagnostic(
                    "ble_disconnected_unexpectedly",
                    diagnosticProperties(boardConfig, "connect") + mapOf(
                        "message" to "Board disconnected unexpectedly",
                        "error_code" to status,
                        "gatt_status" to status,
                    ),
                )
                scheduleAutoReconnect(boardConfig!!, status, "board disconnected")
            } else {
                captureDiagnostic(
                    "ble_disconnected_unexpectedly",
                    diagnosticProperties(boardConfig, "connect") + mapOf(
                        "message" to "Board disconnected unexpectedly",
                        "error_code" to status,
                        "gatt_status" to status,
                    ),
                )
                setError("Board disconnected")
                recordingCoordinator.finishDebugRecording("error")
            }
        }

        override fun onGattReady() {
            Log.d(VESC_SESSION_TAG, "connect phase: gatt ready")
            recordLocalDiagnostic(
                "gatt_ready",
                connectionCoordinator.pendingConnect?.boardConfig ?: boardConfig,
                "connect",
                mapOf("message" to "GATT ready"),
            )
            resolveBleConnect()
        }

        override fun onGattFailure(code: String, message: String) {
            Log.w(VESC_SESSION_TAG, "gatt failure code=$code message=$message boardStatus=$boardStatus")
            failPendingConnect(code, message)
        }

        override fun onGattFrameChunk(chunk: ByteArray) {
            handleFrameChunk(chunk)
        }
    }

    private fun resolveBleConnect() {
        val start = connectionCoordinator.resolvePending() ?: return
        Log.d(VESC_SESSION_TAG, "connect resolved attempt=${connectionCoordinator.connectAttempt} canId=$canId")
        boardStatus = BoardPhase.WaitingForTelemetry
        boardError = null
        recordLocalDiagnostic(
            "waiting_for_telemetry_started",
            start.boardConfig,
            "connect",
            mapOf("message" to "Waiting for board telemetry"),
        )
        emitState()
        presenter.show(boardStatus)
        start.onSuccess()
        if (canId != null) {
            startPolling()
        } else {
            val session = boardSession
            if (session != null) {
                scheduler.postDelayedForSession(session, 300L, ::isCurrentBoardSession) {
                    sendStartupPayload(byteArrayOf(COMM_FW_VERSION.toByte()), session)
                }
                scheduler.postDelayedForSession(session, 1_200L, ::isCurrentBoardSession) {
                    sendStartupPayload(byteArrayOf(COMM_PING_CAN.toByte()), session)
                }
            }
            armCanPingTimeout()
        }
        armBoardReadyTimeout(start.boardConfig)
    }

    private fun handleFrameChunk(chunk: ByteArray) {
        recordingCoordinator.recordChunk("rx", chunk)
        for (payload in packetReassembler.feed(chunk)) {
            handlePayload(payload)
        }
    }

    private fun sendStartupPayload(payload: ByteArray, session: BoardSession) {
        if (!isCurrentBoardSession(session)) return
        if (configFsmState !is ConfigRWState.Idle) return
        sendPayloadWithRetry(payload, session)
    }

    private fun handlePayload(payload: ByteArray) {
        if (payload.isEmpty()) return
        lastReceivedCommandByte = payload[0].toInt() and 0xff
        when (payload[0].toInt() and 0xff) {
            COMM_FW_VERSION -> handleFwVersionPayload(payload)
            COMM_PING_CAN -> {
                cancelCanPingTimeout()
                if (!shouldAcceptCanPingResponse(boardStatus)) {
                    Log.d(VESC_SESSION_TAG, "Ignoring late CAN ping response, direct=$directConnection status=$boardStatus")
                    recordLocalDiagnostic(
                        "can_ping_response_ignored",
                        boardConfig,
                        "connect",
                        mapOf(
                            "message" to "Ignoring CAN ping response",
                            "payload_size" to payload.size,
                            "reason" to if (directConnection) "direct_connection_active" else "board_already_connected",
                        ),
                    )
                } else if (payload.size > 1) {
                    canId = payload[1].toInt() and 0xff
                    directConnection = false
                    telemetryPipeline.updateCanId(canId)
                    recordLocalDiagnostic(
                        "can_ping_can_id_discovered",
                        boardConfig,
                        "connect",
                        mapOf(
                            "message" to "CAN id discovered",
                            "discovered_can_id" to canId,
                            "payload_size" to payload.size,
                        ),
                    )
                    emitState()
                    startPolling()
                    sendPayloadWithRetry(byteArrayOf(
                        COMM_FORWARD_CAN.toByte(),
                        (payload[1].toInt() and 0xff).toByte(),
                        COMM_FW_VERSION.toByte(),
                    ))
                } else {
                    Log.d(VESC_SESSION_TAG, "No CAN devices found, using direct connection")
                    canId = null
                    directConnection = true
                    telemetryPipeline.updateCanId(null)
                    recordLocalDiagnostic(
                        "can_ping_direct_fallback",
                        boardConfig,
                        "connect",
                        mapOf(
                            "message" to "CAN ping returned no devices, using direct connection",
                            "reason" to "empty_can_ping_response",
                            "payload_size" to payload.size,
                        ),
                    )
                    emitState()
                    startPolling()
                }
            }
            COMM_GET_CUSTOM_CONFIG_XML -> dispatchConfigEvent(ConfigRWEvent.XmlPayloadReceived(payload))
            COMM_GET_CUSTOM_CONFIG -> dispatchConfigEvent(
                ConfigRWEvent.ConfigBytesPayloadReceived(payload, System.currentTimeMillis()),
            )
            COMM_SET_CUSTOM_CONFIG -> dispatchConfigEvent(ConfigRWEvent.SetConfigResponseReceived(payload))
            COMM_FORWARD_CAN -> {
                if (payload.size >= 3) {
                    when (payload[2].toInt() and 0xff) {
                        COMM_FW_VERSION -> handleFwVersionPayload(payload.copyOfRange(2, payload.size))
                        COMM_GET_CUSTOM_CONFIG_XML -> dispatchConfigEvent(ConfigRWEvent.XmlPayloadReceived(payload))
                        COMM_GET_CUSTOM_CONFIG -> dispatchConfigEvent(
                            ConfigRWEvent.ConfigBytesPayloadReceived(payload, System.currentTimeMillis()),
                        )
                        COMM_SET_CUSTOM_CONFIG -> dispatchConfigEvent(ConfigRWEvent.SetConfigResponseReceived(payload))
                    }
                }
            }
            COMM_CUSTOM_APP_DATA -> {
                val now = System.currentTimeMillis()
                val parsed = parseRefloatGetAllData(
                    payload = payload,
                    avgLatency = updateLatency(now),
                    packetAt = now,
                    location = latestLocation,
                ) ?: run {
                    captureTelemetryParseFailed(payload)
                    return
                }
                val sessionToken = boardSession ?: return
                val processed = telemetryPipeline.process(parsed, sessionToken) ?: return
                markBoardReady()
                telemetry = parsed
                val batteryPct = BatterySocEstimator.estimateBatteryPercent(
                    parsed.batteryVoltage,
                    batteryConfigCache,
                    parsed.batteryCurrent,
                )
                val firedAlerts = evaluateAlerts(parsed, batteryPct)
                val eventMap = processed.eventMap
                if (firedAlerts.isNotEmpty()) eventMap["firedAlerts"] = firedAlerts
                eventMap["generation"] = currentSessionId
                eventMap["batteryPercent"] = batteryPct
                val emitMap = if (processed.metricExclusionUpdates.isNotEmpty()) {
                    eventMap + mapOf("metricExclusionUpdates" to processed.metricExclusionUpdates)
                } else eventMap
                presenter.show(boardStatus, telemetry = parsed, batteryPercent = batteryPct)
                emitEvent("onTelemetry", emitMap)
                recordingCoordinator.recordTelemetry(processed.capture)
            }
        }
    }

    private fun handleFwVersionPayload(payload: ByteArray) {
        if (payload.size < 3) return
        val hex = payload.joinToString(" ") { "%02x".format(it) }
        Log.d(VESC_SESSION_TAG, "FW version raw (${payload.size} bytes): $hex")
        val major = payload[1].toInt() and 0xff
        val minor = payload[2].toInt() and 0xff
        var hwNameEnd = 3
        while (hwNameEnd < payload.size && payload[hwNameEnd] != 0.toByte()) hwNameEnd++
        val hwName = if (hwNameEnd > 3) String(payload, 3, hwNameEnd - 3, Charsets.UTF_8) else null
        // After HW name null: 12 UUID + 1 paired + 1 test version + 1 hw type = 15 bytes
        var offset = hwNameEnd + 1 + 15
        val customConfigs = mutableListOf<String>()
        if (offset < payload.size) {
            val count = payload[offset].toInt() and 0xff
            offset++
            for (i in 0 until count) {
                val start = offset
                while (offset < payload.size && payload[offset] != 0.toByte()) offset++
                if (offset > start) customConfigs.add(String(payload, start, offset - start, Charsets.UTF_8))
                offset++
            }
        }
        val parts = mutableListOf("FW $major.${"%02d".format(minor)}")
        if (hwName != null) parts.add(hwName)
        if (customConfigs.isNotEmpty()) parts.add(customConfigs.joinToString(", "))
        fwVersionString = parts.joinToString(" · ")
        Log.d(VESC_SESSION_TAG, "FW version: $fwVersionString")
    }

    private fun dumpRefloatConfigDebug(xmlBytes: ByteArray, configBytes: ByteArray) {
        try {
            val dir = File(filesDir, "refloat-debug").apply { mkdirs() }
            File(dir, "custom-config-xml.bin").writeBytes(xmlBytes)
            File(dir, "custom-config-xml.txt").writeText(xmlBytes.toString(Charsets.UTF_8))
            val normalizedXmlBytes = RefloatConfigSchemaParser.normalizeXmlBytes(xmlBytes)
            File(dir, "custom-config-xml-normalized.bin").writeBytes(normalizedXmlBytes)
            File(dir, "custom-config-xml-normalized.txt").writeText(normalizedXmlBytes.toString(Charsets.UTF_8))
            File(dir, "custom-config.bin").writeBytes(configBytes)
            File(dir, "custom-config.hex").writeText(configBytes.joinToString(" ") { "%02x".format(it) })
            Log.w(
                VESC_SESSION_TAG,
                "Refloat debug dump dir=${dir.absolutePath} xmlBytes=${xmlBytes.size} normalizedXmlBytes=${normalizedXmlBytes.size} configBytes=${configBytes.size} xmlPrefix=${xmlBytes.take(128).joinToString(" ") { "%02x".format(it) }} normalizedXmlPrefix=${normalizedXmlBytes.take(128).joinToString(" ") { "%02x".format(it) }}",
            )
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Failed to dump Refloat config debug files", e)
        }
    }

    // --- Config write flow (push profile to board) ---

    private fun consumePendingConfigWrite() {
        val pending = pendingConfigWrite ?: return
        pendingConfigWrite = null
        if (configFsmState !is ConfigRWState.Idle) {
            pending.onError(
                RefloatConfigErrorCode.CONFIG_REQUEST_IN_FLIGHT.name,
                "Config operation already in flight",
            )
            return
        }
        if (boardConfig == null || boardStatus != BoardPhase.Connected) {
            pending.onError(
                RefloatConfigErrorCode.BOARD_NOT_CONNECTED.name,
                "Board must be connected before pushing config",
            )
            return
        }
        val transport = currentBoardTransport()
        if (transport == null) {
            pending.onError(
                RefloatConfigErrorCode.CAN_ID_UNAVAILABLE.name,
                "Cannot push config before CAN id discovery",
            )
            return
        }
        appDataScope.launch {
            val profile = try {
                AppDataRepository.get(applicationContext).getTuneProfile(pending.profileId)
            } catch (e: Exception) {
                null
            }
            if (profile == null) {
                scheduler.post {
                    pending.onError(
                        RefloatConfigErrorCode.PROFILE_NOT_FOUND.name,
                        "Tune profile not found: ${pending.profileId}",
                    )
                }
                return@launch
            }
            @Suppress("UNCHECKED_CAST")
            val fields = (profile["fields"] as? Map<String, Any>) ?: emptyMap()
            scheduler.post {
                if (configFsmState !is ConfigRWState.Idle) {
                    pending.onError(
                        RefloatConfigErrorCode.CONFIG_REQUEST_IN_FLIGHT.name,
                        "Config operation already in flight",
                    )
                    return@post
                }
                if (boardConfig == null || boardStatus != BoardPhase.Connected) {
                    pending.onError(
                        RefloatConfigErrorCode.BOARD_NOT_CONNECTED.name,
                        "Board must be connected before pushing config",
                    )
                    return@post
                }
                val profileBoardId = profile["boardId"] as? String
                val connectedBoardId = boardConfig?.appBoardId
                if (profileBoardId.isNullOrBlank() || connectedBoardId.isNullOrBlank() || profileBoardId != connectedBoardId) {
                    pending.onError(
                        RefloatConfigErrorCode.PROFILE_BOARD_MISMATCH.name,
                        "Tune profile does not belong to the connected board",
                    )
                    return@post
                }
                val currentCanId = canId
                val currentTransport = boardTransport(currentCanId, directConnection)
                if (currentTransport == null) {
                    pending.onError(
                        RefloatConfigErrorCode.CAN_ID_UNAVAILABLE.name,
                        "Cannot push config before CAN id discovery",
                    )
                    return@post
                }
                val wasPolling = pollingLoop.isActive
                stopPolling()
                configWriteCallbacks = pending
                dispatchConfigEvent(
                    ConfigRWEvent.StartWrite(
                        opId = newOperationId(),
                        canId = currentCanId,
                        transport = currentTransport,
                        wasPolling = wasPolling,
                        profileFields = fields,
                        appBoardId = boardConfig?.appBoardId,
                        fwVersion = fwVersionString,
                    ),
                )
            }
        }
    }

    private fun dispatchConfigEvent(event: ConfigRWEvent) {
        val (next, effects) = ConfigRWFsm.apply(configFsmState, event)
        configFsmState = next
        effects.forEach(::interpretConfigEffect)
    }

    private fun interpretConfigEffect(effect: ConfigRWEffect) {
        when (effect) {
            is ConfigRWEffect.SendFrame -> {
                if (!sendPayload(effect.payload)) {
                    dispatchConfigEvent(ConfigRWEvent.GattWriteFailed("Board GATT is not writable"))
                }
            }
            is ConfigRWEffect.ScheduleTimeout -> {
                configTimeoutHandle?.cancel()
                val code = effect.code
                configTimeoutHandle = scheduler.postDelayed(effect.timeoutMs) {
                    configTimeoutHandle = null
                    dispatchConfigEvent(ConfigRWEvent.Timeout(code))
                }
            }
            ConfigRWEffect.CancelTimeout -> {
                configTimeoutHandle?.cancel()
                configTimeoutHandle = null
            }
            is ConfigRWEffect.EmitReadComplete -> {
                val callbacks = configReadCallbacks
                configReadCallbacks = null
                if (effect.resumePolling && boardConfig != null && isPollingCapable) startPolling()
                val snapshot = effect.snapshot
                appDataScope.launch {
                    try {
                        AppDataRepository.get(applicationContext).createMainTuneProfileIfMissing(snapshot)
                    } catch (e: Exception) {
                        Log.w(VESC_SESSION_TAG, "Failed to auto-create main tune profile", e)
                    }
                    scheduler.post { callbacks?.onSuccess?.invoke(snapshot.toMap()) }
                }
            }
            is ConfigRWEffect.EmitReadFailure -> {
                val callbacks = configReadCallbacks
                configReadCallbacks = null
                if (effect.resumePolling && boardConfig != null && isPollingCapable) startPolling()
                val eventName = if (
                    effect.code == RefloatConfigErrorCode.CONFIG_DECODE_FAILED ||
                    effect.code == RefloatConfigErrorCode.UNSUPPORTED_SCHEMA
                ) "config_decode_failed" else "config_read_failed"
                captureDiagnostic(
                    eventName,
                    diagnosticProperties(boardConfig, "config_read") + mapOf(
                        "operation_id" to effect.opId,
                        "message" to effect.message,
                        "error_code" to effect.code.name,
                        "firmware" to fwVersionString,
                    ) + DiagnosticReporter.configBlobProperties(effect.rawConfig),
                )
                callbacks?.onError?.invoke(effect.code.name, effect.message)
            }
            is ConfigRWEffect.EmitWriteComplete -> {
                val callbacks = configWriteCallbacks
                configWriteCallbacks = null
                if (effect.resumePolling && boardConfig != null && isPollingCapable) startPolling()
                val snapshot = effect.snapshot
                appDataScope.launch {
                    try {
                        AppDataRepository.get(applicationContext).createMainTuneProfileIfMissing(snapshot)
                    } catch (e: Exception) {
                        Log.w(VESC_SESSION_TAG, "Failed to update profile after push", e)
                    }
                    scheduler.post { callbacks?.onSuccess?.invoke(snapshot.toMap()) }
                }
            }
            is ConfigRWEffect.EmitWriteFailure -> {
                val callbacks = configWriteCallbacks
                configWriteCallbacks = null
                if (effect.resumePolling && boardConfig != null && isPollingCapable) startPolling()
                captureDiagnostic(
                    "profile_push_failed",
                    diagnosticProperties(boardConfig, "profile_push") + mapOf(
                        "operation_id" to effect.opId,
                        "message" to effect.message,
                        "error_code" to effect.code.name,
                        "phase" to effect.phase.name,
                        "firmware" to fwVersionString,
                    ) + DiagnosticReporter.configBlobProperties(effect.rawConfig),
                )
                callbacks?.onError?.invoke(effect.code.name, effect.message)
            }
            is ConfigRWEffect.DumpDebugBytes -> dumpRefloatConfigDebug(effect.xmlBytes, effect.configBytes)
        }
    }

    private fun startPolling() {
        val session = boardConfig ?: return
        val sessionToken = boardSession ?: return
        val transport = currentBoardTransport() ?: return
        telemetryPipeline.armStaleWatchdog()
        recordLocalDiagnostic(
            "telemetry_polling_started",
            session,
            "telemetry",
            mapOf(
                "message" to "Telemetry polling started",
                "polling_mode" to if (canId != null) "can" else if (directConnection) "direct" else "unavailable",
                "poll_interval_ms" to session.pollIntervalMs,
            ),
        )
        pollingLoop.start(session, sessionToken, transport)
    }

    private fun currentBoardTransport(): BoardTransport? = boardTransport(canId, directConnection)

    private fun stopPolling() {
        pollingLoop.stop()
        telemetryPipeline.cancelStaleWatchdog()
    }

    private fun armCanPingTimeout() {
        cancelCanPingTimeout()
        val session = boardSession ?: return
        canPingTimeoutHandle = scheduler.postDelayedForSession(session, CAN_PING_TIMEOUT, ::isCurrentBoardSession) {
            canPingTimeoutHandle = null
            if (shouldCanPingFallback(canId, directConnection, boardStatus)) {
                Log.d(VESC_SESSION_TAG, "CAN ping timeout, falling back to direct connection")
                canId = null
                directConnection = true
                telemetryPipeline.updateCanId(null)
                recordLocalDiagnostic(
                    "can_ping_direct_fallback",
                    boardConfig,
                    "connect",
                    mapOf(
                        "message" to "CAN ping timed out, using direct connection",
                        "reason" to "can_ping_timeout",
                        "timeout_ms" to CAN_PING_TIMEOUT,
                    ),
                )
                emitState()
                startPolling()
            }
        }
    }

    private fun cancelCanPingTimeout() {
        canPingTimeoutHandle?.cancel()
        canPingTimeoutHandle = null
    }

    private fun boardReadyTimeoutMs(): Long =
        ReconnectPolicy.boardReadyTimeoutMs(reconnectScheduler.currentAttempt)

    private fun armBoardReadyTimeout(session: SessionConfig) {
        if (!session.autoReconnect) return
        cancelBoardReadyTimeout()
        val sessionToken = boardSession ?: return
        val timeoutMs = boardReadyTimeoutMs()
        boardReadyTimeoutHandle = scheduler.postDelayedForSession(sessionToken, timeoutMs, ::isCurrentBoardSession) {
            boardReadyTimeoutHandle = null
            if (
                (boardStatus == BoardPhase.Connecting || boardStatus == BoardPhase.WaitingForTelemetry) &&
                boardConfig?.autoReconnect == true &&
                telemetry == null
            ) {
                recordLocalDiagnostic(
                    "board_ready_timeout",
                    session,
                    "connect",
                    mapOf(
                        "message" to "Board telemetry unavailable before ready timeout",
                        "timeout_ms" to timeoutMs,
                    ),
                )
                scheduleAutoReconnect(session, null, "board telemetry unavailable")
            }
        }
    }

    private fun cancelBoardReadyTimeout() {
        boardReadyTimeoutHandle?.cancel()
        boardReadyTimeoutHandle = null
    }

    private fun markBoardReady() {
        cancelBoardReadyTimeout()
        cancelCanPingTimeout()
        if (shouldSetDirectOnReady(canId, directConnection)) {
            Log.d(VESC_SESSION_TAG, "Telemetry received before CAN discovery, assuming direct connection")
            canId = null
            directConnection = true
            telemetryPipeline.updateCanId(null)
        }
        if (shouldStartPollingOnReady(canId, directConnection, pollingLoop.takeIf { it.isActive })) {
            startPolling()
        }
        if (boardStatus == BoardPhase.Connected) return
        reconnectScheduler.resetAttempts()
        boardStatus = BoardPhase.Connected
        recordLocalDiagnostic(
            "board_ready",
            boardConfig,
            "connect",
            mapOf("message" to "Board telemetry received"),
        )
        boardError = null
        boardConfig?.let { recordingCoordinator.markBoardReady(it) }
        emitState()
    }

    private fun onTelemetryStaleFired() {
        val session = boardConfig ?: return
        if (boardStatus == BoardPhase.Connected && session.autoReconnect) {
            boardStatus = BoardPhase.Stale
            emitState()
            scheduleAutoReconnect(session, null, "telemetry stale")
        }
    }

    private fun sendPayload(payload: ByteArray): Boolean {
        lastSentCommand = payload.getOrNull(0)?.toInt()?.and(0xff)
        return gattClient.sendPayload(payload)
    }

    private fun sendPayloadWithRetry(payload: ByteArray, session: BoardSession? = boardSession): Boolean {
        if (session != null && !isCurrentBoardSession(session)) return false
        val sent = sendPayload(payload)
        if (!sent) {
            if (session != null) {
                scheduler.postDelayedForSession(session, 120L, ::isCurrentBoardSession) {
                    sendPayload(payload)
                }
            }
        }
        return sent
    }

    private fun isCurrentBoardSession(session: BoardSession): Boolean =
        session.isActive && session === boardSession && !isStoppingService

    private fun updateLatency(now: Long): Int? {
        return pollingLoop.updateLatency(now)
    }

    private fun stopCurrentBoardSession(emitDisconnected: Boolean, updateNotification: Boolean = true) {
        flushTelemetryDiagnostics("stop")
        if (configFsmState !is ConfigRWState.Idle) {
            dispatchConfigEvent(
                ConfigRWEvent.SessionTerminated("Board session stopped during Refloat config op"),
            )
        }
        val stoppedConfig = boardConfig
        reconnectScheduler.cancelAndReset()
        cancelBoardReadyTimeout()
        cancelCanPingTimeout()
        stopPolling()
        gattClient.clear(markIntentional = true)
        alertFeedback.stopAllGeiger()
        activeGeigerRuleIds = emptySet()
        recordingCoordinator.finishBoardSession(
            status = if (emitDisconnected) "disconnected" else "stopped",
            markerType = if (emitDisconnected) "disconnected" else "app_stop",
            config = stoppedConfig,
        )
        connectionCoordinator.clearPending()
        canId = null
        directConnection = false
        fwVersionString = null
        telemetry = null
        boardSession?.invalidate()
        boardSession = null
        telemetryPipeline.endSession()
        sessionSequence += 1
        boardError = null
        boardStatus = BoardPhase.Idle
        boardConfig = null
        if (updateNotification && !isStoppingService && stoppedConfig != null) presenter.show(boardStatus)
        emitState()
    }

    private fun failPendingConnect(code: String, message: String) {
        connectionCoordinator.pendingConnect?.let { failStart(it, code, message) }
    }

    private fun failStart(start: PendingStart, code: String, message: String) {
        captureDiagnostic(
            "ble_connect_failed",
            diagnosticProperties(start.boardConfig, "connect") + mapOf(
                "message" to message,
                "error_code" to code,
            ),
        )
        if (start.boardConfig.autoReconnect) {
            scheduleAutoReconnect(start.boardConfig, null, message)
            start.onError(code, message)
            return
        }
        connectionCoordinator.clearPending()
        cancelBoardReadyTimeout()
        stopPolling()
        gattClient.clear(markIntentional = true)
        setError(message)
        presenter.show(boardStatus, errorMessage = message)
        recordingCoordinator.failSession()
        start.onError(code, message)
    }

    private fun setStatus(next: BoardPhase) {
        boardStatus = next
        recordingCoordinator.recordState(next.recordName())
        emitState()
    }

    private fun scheduleAutoReconnect(session: SessionConfig, gattStatus: Int?, reason: String) {
        if (!session.autoReconnect || isStoppingService) return
        val reconnectSession = boardSession ?: return
        reconnectScheduler.schedule(
            session = reconnectSession,
            targetDeviceId = session.deviceId,
            reason = reason,
            gattStatus = gattStatus,
        )
    }

    private fun setError(message: String) {
        boardStatus = BoardPhase.Error
        boardError = message
        recordingCoordinator.recordError(boardConfig, message)
        emitEvent("onError", mapOf("message" to message))
        emitState()
    }

    private fun refreshNotification() {
        presenter.show(
            phase = boardStatus,
            telemetry = telemetry,
            batteryPercent = telemetry?.let {
                BatterySocEstimator.estimateBatteryPercent(it.batteryVoltage, batteryConfigCache, it.batteryCurrent)
            },
            errorMessage = boardError,
        )
    }

    private fun emitState() {
        emitEvent("onLiveState", liveStateMap())
    }

    private fun emitEvent(name: String, body: Map<String, Any?>) {
        emitEvent?.invoke(name, body)
    }

    private fun startLocationUpdates() {
        gpsError = gpsMonitor.start()
        if (gpsError != null) emitState()
    }

    private fun stopLocationUpdates() {
        gpsMonitor.stop()
    }

    private fun setTelemetryRecordingEnabled(enabled: Boolean) {
        val session = boardConfig
        if (enabled) {
            if (
                session == null ||
                boardStatus == BoardPhase.Idle ||
                boardStatus == BoardPhase.Connecting ||
                boardStatus == BoardPhase.Discovering ||
                boardStatus == BoardPhase.Subscribing ||
                boardStatus == BoardPhase.Disconnecting ||
                boardStatus == BoardPhase.Error
            ) {
                RecordingCoordinator.requestTelemetryRecording(false)
                emitEvent("onError", mapOf("message" to "Recording requires a connected board"))
                emitState()
                return
            }
            recordingCoordinator.enableTelemetryRecording(session)
            emitState()
            return
        }

        recordingCoordinator.disableTelemetryRecording(session)
        emitState()
    }

    private fun onLocationUpdated(location: Location) {
        val speedMps = if (location.hasSpeed()) location.speed.toDouble() else null
        val bearingDeg = if (location.hasBearing()) location.bearing.toDouble() else null
        val accuracyM = if (location.hasAccuracy()) location.accuracy.toDouble() else null
        val altitudeM = if (location.hasAltitude()) location.altitude else null
        val precise = isRecordableGpsLocation(location, accuracyM)
        val snapshot = LocationSnapshot(
            latitude = location.latitude,
            longitude = location.longitude,
            speedMps = speedMps,
            bearingDeg = bearingDeg,
            accuracyM = accuracyM,
            altitudeM = altitudeM,
            timestamp = location.time,
            precise = precise,
        )
        latestLocation = snapshot
        if (!precise) {
            emitEvent("onLocation", snapshot.toMap())
            return
        }
        latestLocation = snapshot
        latestPreciseLocation = snapshot
        persistLastGpsLocation(snapshot)
        appendRecentLocation(snapshot)
        emitEvent("onLocation", snapshot.toMap())
        recordingCoordinator.recordLocation(snapshot)
    }

    private fun persistLastGpsLocation(location: LocationSnapshot) {
        val now = System.currentTimeMillis()
        if (now - lastGpsPersistedAt < LAST_GPS_PERSIST_INTERVAL_MS) return
        lastGpsPersistedAt = now
        appDataScope.launch {
            AppDataRepository.get(applicationContext).updateLastGpsLocation(
                latitude = location.latitude,
                longitude = location.longitude,
            )
        }
    }

    private fun isRecordableGpsLocation(location: Location, accuracyM: Double?): Boolean =
        isPreciseGpsFix(location.provider, accuracyM)

    private fun liveStateMap(includeRecent: Boolean = false): Map<String, Any?> {
        val settings = kotlinx.coroutines.runBlocking {
            AppDataRepository.get(applicationContext).getTypedSettings()
        }
        applyTelemetrySettings(settings)
        val now = System.currentTimeMillis()
        val lastTelemetryAt = telemetryPipeline.lastTelemetryAt
        val phase = if (
            boardStatus == BoardPhase.Connected &&
            lastTelemetryAt > 0L &&
            now - lastTelemetryAt >= TELEMETRY_STALE_MS
        ) BoardPhase.Stale else boardStatus
        val recentTelemetryValue = if (includeRecent) telemetryPipeline.recentSnapshot() else emptyList()
        val recentLocationsValue = if (includeRecent) recentLocations.toList() else emptyList()

        return buildLiveState(
            VescLiveStateSnapshot(
                boardPhase = phase,
                boardConfig = boardConfig,
                boardError = boardError,
                connectionSeq = currentSessionId,
                lastTelemetryAt = telemetry?.lastPacketAt,
                recentTelemetry = recentTelemetryValue,
                gpsActive = gpsMonitor.active,
                latestLocation = latestLocation,
                latestPreciseLocation = latestPreciseLocation,
                recentLocations = recentLocationsValue,
                gpsError = gpsError,
                recordingEnabled = recordingCoordinator.telemetryRecordingEnabled,
                settings = settings,
            )
        )
    }

    private suspend fun loadAlertRules(context: Context) {
        try {
            val rules = AppDataRepository.get(context).getEnabledAlertRuleEntities()
            alertRules = rules
            alertEngine.resetDebounce()
            Log.d(VESC_SESSION_TAG, "Loaded ${rules.size} alert rule(s)")
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Failed to load alert rules: ${e.message}")
            alertRules = emptyList()
        }
    }

    private fun loadBatteryConfig(appBoardId: String?) {
        if (appBoardId == null) {
            batteryConfigCache = null
            return
        }
        batteryConfigCache = try {
            val board = kotlinx.coroutines.runBlocking {
                AppDataRepository.get(applicationContext).getBoard(appBoardId)
            }
            board?.get("batteryConfig") as? Map<String, Any?>
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Failed to load battery config: ${e.message}")
            null
        }
    }

    private fun evaluateAlerts(t: RefloatTelemetry, batteryPercent: Double?): List<Map<String, Any?>> {
        val fired = alertEngine.evaluate(alertRules, t, batteryPercent)
        val geiger = fired.filter { it.rangeDepth != null }
        val geigerRuleIds = geiger.mapTo(HashSet()) { it.ruleId }
        for (ruleId in activeGeigerRuleIds - geigerRuleIds) {
            alertFeedback.stopGeiger(ruleId)
        }
        activeGeigerRuleIds = geigerRuleIds
        for (alert in geiger) {
            alertFeedback.updateGeiger(alert.ruleId, alert.soundType, alert.rangeDepth ?: 0.0)
        }

        val single = fired.filter { it.rangeDepth == null }
        if (single.isNotEmpty()) {
            val ttsAlert = single.firstOrNull { it.soundType.startsWith("tts:") && it.thresholdMax == null }
            if (ttsAlert != null) {
                val template = ttsAlert.soundType.removePrefix("tts:")
                val text = renderAlertMessageTemplate(template, ttsAlert, batteryPercent) { name, props ->
                    recordLocalDiagnostic(name, boardConfig, "alert", props)
                }
                if (text.isNotEmpty()) alertFeedback.speakMessage(text)
            }
            for (alert in single) {
                if (!alert.soundType.startsWith("tts:")) {
                    alertFeedback.playSingle(alert.soundType)
                }
            }
            alertFeedback.vibrate(null)
        }
        return fired.map { it.toMap() }
    }

    private fun appendRecentLocation(location: LocationSnapshot) {
        val point = location.toMap()
        recentLocations.addLast(point)
        pruneRecentLocations(location.timestamp)
    }

    private fun pruneRecentLocations(nowMs: Long) {
        val oldest = nowMs - telemetryPipeline.recentWindowMs()
        while (recentLocations.isNotEmpty()) {
            val ts = (recentLocations.first()["timestamp"] as? Number)?.toLong() ?: break
            if (ts >= oldest) break
            recentLocations.removeFirst()
        }
    }

    private fun applyLiveHistoryLimitMinutes(minutes: Int) {
        telemetryPipeline.setLiveHistoryLimitMinutes(minutes)
        pruneRecentLocations(System.currentTimeMillis())
    }

    private fun refreshLiveHistoryLimit() {
        val settings = kotlinx.coroutines.runBlocking {
            AppDataRepository.get(applicationContext).getTypedSettings()
        }
        applyTelemetrySettings(settings)
    }

    private suspend fun loadTelemetrySettings(context: Context) {
        applyTelemetrySettings(AppDataRepository.get(context).getTypedSettings())
    }

    private fun applyTelemetrySettings(settings: AppSettings) {
        applyTelemetryPipelineSettings(settings)
        recordingCoordinator.applySettings(settings)
    }

    private fun applyTelemetryPipelineSettings(settings: AppSettings) {
        applyLiveHistoryLimitMinutes(settings.liveHistoryLimit)
        telemetryPipeline.metricSanitizerConfig = settings.toMetricSanitizerConfig()
    }

    private fun closeAppTask() {
        notificationController.closeAppTask()
    }

    private fun armConnectPhaseTimeout(start: PendingStart, phase: String, timeoutMs: Long) {
        connectionCoordinator.armConnectPhaseTimeout(
            start = start,
            phase = phase,
            timeoutMs = timeoutMs,
            status = { boardStatus },
            canId = { canId },
            onTimeout = ::onConnectPhaseTimeout,
        )
    }

    private fun onConnectPhaseTimeout(timeout: ConnectPhaseTimeout) {
        Log.w(
            VESC_SESSION_TAG,
            "connect phase timeout phase=${timeout.phase} device=${timeout.start.boardConfig.deviceId} attempt=${timeout.attempt} elapsedMs=${timeout.elapsedMs} status=${timeout.boardStatus} canId=${timeout.canId}",
        )
        recordLocalDiagnostic(
            "connect_phase_timeout",
            timeout.start.boardConfig,
            "connect",
            mapOf(
                "message" to "BLE connect phase timed out",
                "connect_phase" to timeout.phase,
                "elapsed_ms" to timeout.elapsedMs,
                "timeout_ms" to timeout.timeoutMs,
            ),
        )
        failStart(timeout.start, "CONNECT_TIMEOUT", "Timed out connecting to board")
    }

    private fun captureTelemetryParseFailed(payload: ByteArray): Unit =
        diagnosticsRecorder.captureTelemetryParseFailed(payload, boardConfig)

    private fun flushTelemetryDiagnostics(reason: String): Unit =
        diagnosticsRecorder.flushTelemetryDiagnostics(reason, boardConfig)

    private fun captureDiagnostic(eventName: String, properties: Map<String, Any?>): Unit =
        diagnosticsRecorder.captureDiagnostic(eventName, properties)

    private fun recordLocalDiagnostic(
        eventName: String,
        session: SessionConfig?,
        operation: String,
        properties: Map<String, Any?> = emptyMap(),
    ): Unit = diagnosticsRecorder.recordLocalDiagnostic(eventName, session, operation, properties)

    private fun diagnosticProperties(session: SessionConfig?, operation: String): Map<String, Any?> =
        diagnosticsRecorder.diagnosticProperties(session, operation)

}
