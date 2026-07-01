package expo.modules.vescble

import android.annotation.SuppressLint
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File
import kotlin.math.roundToInt
import kotlinx.coroutines.launch
import expo.modules.vescble.config.ConfigRWEvent
import expo.modules.vescble.connection.ConnectPhaseTimeout
import expo.modules.vescble.connection.ConnectionCoordinator
import expo.modules.vescble.diagnostics.DiagnosticContext
import expo.modules.vescble.diagnostics.DiagnosticsRecorder
import expo.modules.vescble.notification.NotificationPresenter
import expo.modules.vescble.recording.RecordingCoordinator
import expo.modules.vescble.reconnect.RECONNECT_MAX_ATTEMPTS
import expo.modules.vescble.reconnect.ReconnectListener
import expo.modules.vescble.reconnect.ReconnectPolicy
import expo.modules.vescble.reconnect.ReconnectScanMatch
import expo.modules.vescble.reconnect.ReconnectScheduler
import expo.modules.vescble.runtime.BoardSession
import expo.modules.vescble.runtime.Cancellable
import expo.modules.vescble.runtime.HandlerScheduler
import expo.modules.vescble.runtime.Scheduler
import expo.modules.vescble.runtime.postDelayedForSession
import expo.modules.vescble.telemetry.AppDataRepository
import expo.modules.vescble.telemetry.AppSettings
import expo.modules.vescble.telemetry.BatterySocEstimator
import expo.modules.vescble.telemetry.DEFAULT_MOVING_SPEED_THRESHOLD_CENTI_KMH
import expo.modules.vescble.telemetry.IDLE_PAUSE_POLL_INTERVAL_MS
import expo.modules.vescble.telemetry.IdlePauseDetector
import expo.modules.vescble.telemetry.IdlePauseTransition
import expo.modules.vescble.telemetry.METRIC_MAX_DUTY
import expo.modules.vescble.telemetry.PrivacyZoneEntity
import expo.modules.vescble.telemetry.SocMedianWindow
import expo.modules.vescble.telemetry.TelemetryCapture
import expo.modules.vescble.telemetry.TelemetryPipeline
import expo.modules.vescble.telemetry.TelemetryRepository
import expo.modules.vescble.telemetry.isInsideAnyPrivacyZone
import expo.modules.vescble.telemetry.toMetricSanitizerConfig

private const val CHANNEL_ID = "vesc_monitoring_v5"
private const val NOTIFICATION_ID = 1001
private const val HISTORY_FLUSH_INTERVAL_MS = 300L
private const val LIVE_SERIES_INTERVAL_MS = 1_000L
private const val LIVE_SERIES_BUCKETS = 64
private const val WATCH_FRAME_INTERVAL_MS = 500L
private const val GATT_CONNECT_TIMEOUT_MS = 6_000L
private const val GATT_READY_TIMEOUT_MS = 6_000L

/**
 * Owns the durable board-session state and orchestration. [VescForegroundService] is a thin Android
 * shell delegating lifecycle + the static JS bridge here. Holds a [service] reference solely for the
 * Android primitives the orchestration needs (Context, foreground notification, stopSelf, filesDir).
 */
@SuppressLint("MissingPermission")
internal class BoardSessionController(private val service: VescForegroundService) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val scheduler: Scheduler = HandlerScheduler(mainHandler)
    private val packetReassembler = VescPacketReassembler()
    private val pollingLoop = PollingLoop(
        scheduler = scheduler,
        isCurrentSession = ::isCurrentBoardSession,
        sendPayloadWithRetry = { payload, session -> sendPayloadWithRetry(payload, session) },
    )
    // Idle Pause (ADR-0021): while recording a stationary board, throttle polling to ~1 Hz and stop
    // persisting samples. configuredPollIntervalMs / movingThresholdCentiKmh are cached from settings
    // so the hot path can flip pacing without re-reading settings.
    private val idlePauseDetector = IdlePauseDetector()
    private var configuredPollIntervalMs: Long = 0L
    private var movingThresholdCentiKmh: Int = DEFAULT_MOVING_SPEED_THRESHOLD_CENTI_KMH
    private val connectionCoordinator = ConnectionCoordinator(
        scheduler = scheduler,
        isCurrentSession = ::isCurrentBoardSession,
    )
    private val remoteTiltController = RemoteTiltController(
        scheduler = scheduler,
        transport = {
            if (boardStatus == BoardPhase.Connected && boardConfig != null) currentBoardTransport() else null
        },
        send = { payload, urgent -> gattClient.sendRemoteTilt(payload, urgent) },
    )
    private val notificationController by lazy {
        VescNotificationController(
            service = service,
            serviceClass = VescForegroundService::class.java,
            channelId = CHANNEL_ID,
            notificationId = NOTIFICATION_ID,
            stopAction = ACTION_EXIT_FROM_NOTIFICATION,
            connectAction = ACTION_CONNECT_FROM_NOTIFICATION,
            disconnectAction = ACTION_DISCONNECT_FROM_NOTIFICATION,
        )
    }
    private val presenter by lazy {
        NotificationPresenter(
            controller = notificationController,
            deviceName = { boardConfig?.deviceName ?: selectedBoardName },
            sessionActive = { boardConfig != null },
            canConnect = { boardConfig == null && selectedBoardName != null },
        )
    }
    private val alertFeedback by lazy { VescAlertFeedback(service, mainHandler) }
    private val alertCoordinator by lazy { AlertCoordinator { alertFeedback } }
    private val diagnosticsRecorder: DiagnosticsRecorder by lazy {
        DiagnosticsRecorder(
            local = { name, props ->
                TelemetryRepository.get(service.applicationContext).recordDiagnosticEvent(name, props)
            },
            remote = { name, props -> DiagnosticReporter.get(service).capture(name, props) },
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
            context = service.applicationContext,
            applyLiveSettings = ::applyTelemetryPipelineSettings,
        )
    }
    private val liveSeriesEmitter by lazy {
        LiveSeriesEmitter(
            scheduler = scheduler,
            emitEvent = ::emitEvent,
            telemetryPipeline = telemetryPipeline,
            session = { boardSession },
            isCurrentSession = ::isCurrentBoardSession,
            generation = { currentSessionId },
            historyFlushIntervalMs = HISTORY_FLUSH_INTERVAL_MS,
            liveSeriesIntervalMs = LIVE_SERIES_INTERVAL_MS,
            liveSeriesBuckets = LIVE_SERIES_BUCKETS,
        )
    }
    private val watchPusher by lazy {
        WatchTelemetryPusher(service.applicationContext, VescForegroundService.appDataScope)
    }
    private val watchMirrorPresence by lazy {
        WatchMirrorPresence(service.applicationContext, VescForegroundService.appDataScope)
    }
    private val watchTick by lazy {
        WatchTick(
            scheduler = scheduler,
            session = { boardSession },
            isCurrentSession = ::isCurrentBoardSession,
            snapshot = ::watchSnapshot,
            isStale = { isTelemetryStale() },
            canPush = { watchMirrorPresence.present },
            push = watchPusher::pushFrame,
            intervalMs = WATCH_FRAME_INTERVAL_MS,
        )
    }
    private val locationTracker by lazy {
        LocationTracker(
            service.applicationContext,
            VescForegroundService.appDataScope,
            ::emitEvent,
            recordingCoordinator,
            telemetryPipeline,
        )
    }
    private val configController by lazy {
        ConfigRWController(
            scheduler,
            VescForegroundService.appDataScope,
            { AppDataRepository.get(service.applicationContext) },
            object : ConfigRWControllerPort {
                override fun connection() =
                    ConfigConnectionSnapshot(boardConfig, boardStatus, canId, directConnection, fwVersionString)
                override fun isPollingActive() = pollingLoop.isActive
                override fun stopPolling() = this@BoardSessionController.stopPolling()
                override fun startPolling() = this@BoardSessionController.startPolling()
                override fun sendPayload(payload: ByteArray) = this@BoardSessionController.sendPayload(payload)
                override fun captureDiagnostic(name: String, properties: Map<String, Any?>) =
                    this@BoardSessionController.captureDiagnostic(name, properties)
                override fun diagnosticProperties(config: SessionConfig?, category: String) =
                    this@BoardSessionController.diagnosticProperties(config, category)
                override fun dumpDebugBytes(xmlBytes: ByteArray, configBytes: ByteArray) =
                    this@BoardSessionController.dumpRefloatConfigDebug(xmlBytes, configBytes)
            },
        )
    }
    private val gpsMonitor by lazy {
        VescGpsMonitor(
            context = service,
            looper = Looper.getMainLooper(),
            onLocation = ::onLocationUpdated,
        )
    }
    private val groupRideObserver by lazy {
        GroupRideObserver(handler = mainHandler, emit = ::emitEvent)
    }

    /**
     * Enabled Privacy Zones cached for the Group Ride presence egress gate (issue #144). Refreshed
     * when observing starts and on zone CRUD; reuses the same geometry as Ride Recording
     * suppression (ADR-0009 / ADR-0020). Touched off the main thread, so kept @Volatile.
     */
    @Volatile
    private var groupRidePrivacyZones: List<PrivacyZoneEntity> = emptyList()
    private val gattClient by lazy {
        VescGattClient(
            context = service,
            handler = mainHandler,
            recorder = { recordingCoordinator.currentRecorder() },
            dispatchListener = ::dispatchGattEvent,
            listener = gattListener,
        )
    }

    private val reconnectBlePort = ReconnectBleScanner(
        scanner = { bluetoothAdapter.bluetoothLeScanner },
        scheduler = scheduler,
    )

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
            stopPolling()
            gattClient.clear(markIntentional = false)
            telemetryPipeline.clearLiveTelemetry()
            directConnection = false
            boardError = reason
            transitionBoardPhase(
                next = BoardPhase.Reconnecting,
                recordName = "reconnecting",
                recordProperties = mapOf("attempt" to nextAttempt, "status" to gattStatus),
            )
            presenter.show(reportedBoardPhase())
        }

        override fun onScanStart(session: BoardSession) {
            transitionBoardPhase(BoardPhase.Rescanning)
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
    /** Name of the currently selected board, shown in the idle notification + gating its Connect action. */
    @Volatile
    private var selectedBoardName: String? = null
    @Volatile
    private var batteryConfigCache: Map<String, Any?>? = null
    /** Median window producing the Battery SoC Estimate for display + alerts (ADR-0016). */
    private val socWindow = SocMedianWindow()
    private var boardStatus: BoardPhase = BoardPhase.Idle
    private var boardError: String? = null
    private var telemetry: RefloatTelemetry? = null
    // Latest cold-path values the watch tick reads alongside [telemetry]; reset when telemetry clears.
    private var latestBatterySoc: Double? = null
    private var latestDutyExcluded = false
    private var canId: Int? = null
    private var directConnection = false
    private var fwVersionString: String? = null
    private var boardReadyTimeoutHandle: Cancellable? = null
    private var gpsError: String? = null
    private var isStoppingService = false
    private var connectionSoundsEnabled = true
    private var lastSentCommand: Int? = null
    private var lastReceivedCommandByte: Int? = null
    private var boardSession: BoardSession? = null
    private var sessionSequence: Long = 0L
    private val currentSessionId: Long get() = boardSession?.id ?: sessionSequence
    private val bluetoothAdapter: BluetoothAdapter
        get() = (service.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    // --- Android Service lifecycle hooks (driven by VescForegroundService) ---

    fun onCreate() {
        BatterySocEstimator.init(service)
        DiagnosticReporter.initialize(service)
        notificationController.createChannel()
        refreshSelectedBoardName()
        // startForegroundService() requires startForeground() to be called quickly; satisfy it
        // immediately for every service creation, even when we later decide there's no board to
        // auto-connect. The notification will be refreshed once the idle state/selected board is ready.
        reassertForeground()
    }

    /** Caches the selected board name so the idle notification can title it + offer Connect. */
    private fun refreshSelectedBoardName() {
        VescForegroundService.appDataScope.launch {
            val repo = AppDataRepository.get(service.applicationContext)
            val id = repo.getTypedSettings().selectedBoardId
            selectedBoardName = id?.let { repo.getBoard(it)?.get("name") as? String }
            if (boardConfig == null && !isStoppingService) {
                scheduler.post { if (boardConfig == null && !isStoppingService) presenter.show(reportedBoardPhase()) }
            }
        }
    }

    /** Connect to the selected board from the notification Connect action (native-initiated). */
    fun connectSelectedBoardFromNotification() {
        connectSelectedBoard(recordingEnabled = false)
    }

    fun autoConnectSelectedBoard() {
        VescForegroundService.appDataScope.launch {
            val settings = AppDataRepository.get(service.applicationContext).getTypedSettings()
            if (!settings.autoConnect || settings.selectedBoardId == null) {
                scheduler.post { stopIfIdle() }
                return@launch
            }
            scheduler.post { connectSelectedBoard(recordingEnabled = false) }
        }
    }

    fun connectCompanionDevice(address: String) {
        if (boardConfig != null) return
        isStoppingService = false
        reassertForeground()
        VescForegroundService.appDataScope.launch {
            val appCtx = service.applicationContext
            val boardId = selectedCompanionBoardId(AppDataRepository.get(appCtx), address)
            if (boardId == null) {
                scheduler.post { stopIfIdle() }
                return@launch
            }
            val config = try {
                buildSessionConfig(appCtx, boardId, recordingEnabled = false)
            } catch (e: Exception) {
                Log.w(VESC_SESSION_TAG, "Companion connect config failed: ${e.message}")
                scheduler.post { stopIfIdle() }
                return@launch
            }
            scheduler.post {
                if (boardConfig == null) {
                    beginSession(
                        PendingStart(
                            config,
                            onSuccess = {},
                            onError = { _, message -> Log.w(VESC_SESSION_TAG, "Companion connect failed: $message") },
                        ),
                    )
                }
            }
        }
    }

    private suspend fun selectedCompanionBoardId(repo: AppDataRepository, address: String): String? {
        val settings = repo.getTypedSettings()
        if (!settings.companionPresenceEnabled) return null
        val selectedBoardId = settings.selectedBoardId ?: return null
        val board = repo.getBoard(selectedBoardId) ?: return null
        val link = board["link"] as? Map<*, *> ?: return null
        val bleId = link["bleId"] as? String ?: return null
        return selectedBoardId.takeIf { bleId.equals(address, ignoreCase = true) }
    }

    private fun connectSelectedBoard(recordingEnabled: Boolean) {
        if (boardConfig != null) return
        VescForegroundService.appDataScope.launch {
            val appCtx = service.applicationContext
            val boardId = AppDataRepository.get(appCtx).getTypedSettings().selectedBoardId ?: return@launch
            val config = try {
                buildSessionConfig(appCtx, boardId, recordingEnabled = recordingEnabled)
            } catch (e: Exception) {
                Log.w(VESC_SESSION_TAG, "Notification connect failed: ${e.message}")
                scheduler.post { stopIfIdle() }
                return@launch
            }
            scheduler.post {
                if (boardConfig == null) beginSession(PendingStart(config, onSuccess = {}, onError = { _, _ -> }))
            }
        }
    }

    /** Disconnect the active session from the notification Disconnect action (native-initiated). */
    fun disconnectFromNotification() {
        if (boardConfig == null) return
        setStatus(BoardPhase.Disconnecting)
        // Always refresh: the notification stays visible after disconnect (idle + Connect), so it must
        // reflect the idle phase even while GPS keeps the service foregrounded.
        stopCurrentBoardSession(emitDisconnected = true, updateNotification = true)
    }

    fun onServiceDestroy() {
        if (!isStoppingService) {
            stopCurrentBoardSession(emitDisconnected = false)
        }
        alertFeedback.release()
        stopLocationUpdates()
        groupRideObserver.stop()
        DiagnosticReporter.get(service).flush()
        service.stopForeground(Service.STOP_FOREGROUND_REMOVE)
    }

    val isStopping: Boolean get() = isStoppingService

    fun stopIfIdle() {
        if (boardConfig == null && !gpsMonitor.active && !groupRideObserver.active) service.stopSelf()
    }

    fun consumePendingStart() {
        val start = VescForegroundService.claimPendingStart() ?: return
        beginSession(start)
    }

    fun consumePendingStop() {
        val stop = VescForegroundService.claimPendingStop() ?: return
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
        if (!gpsMonitor.active && !groupRideObserver.active) {
            isStoppingService = true
            service.stopSelf()
        }
    }

    fun consumePendingConfigRead() {
        val pending = VescForegroundService.pendingConfigRead ?: return
        VescForegroundService.pendingConfigRead = null
        configController.consumeRead(pending)
    }

    fun consumePendingConfigWrite() {
        val pending = VescForegroundService.pendingConfigWrite ?: return
        VescForegroundService.pendingConfigWrite = null
        configController.consumeWrite(pending)
    }

    fun consumePendingGpsStart() {
        if (!VescForegroundService.claimPendingGpsStart()) return
        startGpsMonitoring()
    }

    fun consumePendingGroupRideObserve() {
        val url = VescForegroundService.claimPendingGroupRideUrl() ?: return
        isStoppingService = false
        VescForegroundService.appDataScope.launch { loadPrivacyZones(service.applicationContext) }
        groupRideObserver.start(url)
        reassertForeground()
    }

    fun stopGroupRideObserve() {
        VescForegroundService.pendingGroupRideUrl = null
        groupRideObserver.stop()
        if (boardConfig == null && !gpsMonitor.active) {
            isStoppingService = true
            service.stopSelf()
        }
    }

    fun createGroupRide(riderId: String, riderName: String, riderColor: String?, name: String?, lat: Double, lng: Double) {
        groupRideObserver.create(riderId, riderName, riderColor, name, lat, lng)
    }

    fun joinGroupRide(riderId: String, riderName: String, riderColor: String?, rideId: String) {
        startGpsMonitoring()
        groupRideObserver.join(riderId, riderName, riderColor, rideId, latestRiderPresence())
    }

    fun leaveGroupRide() {
        groupRideObserver.leave()
    }

    fun updateGroupRideIdentity(riderId: String, riderName: String, riderColor: String?) {
        groupRideObserver.updateIdentity(riderId, riderName, riderColor)
    }

    fun exitFromNotification() {
        isStoppingService = true
        service.stopForeground(Service.STOP_FOREGROUND_REMOVE)
        notificationController.cancel()
        stopCurrentBoardSession(emitDisconnected = true)
        stopLocationUpdates()
        closeAppTask()
        service.stopSelf()
    }

    private fun startGpsMonitoring() {
        isStoppingService = false
        gpsError = null
        startLocationUpdates()
        emitState()
        reassertForeground()
    }

    fun stopGpsMonitoring() {
        VescForegroundService.pendingGpsStart = false
        stopLocationUpdates()
        gpsError = null
        emitState()
        if (boardConfig == null && !groupRideObserver.active) {
            isStoppingService = true
            service.stopSelf()
        } else {
            reassertForeground()
        }
    }

    private fun beginSession(start: PendingStart) {
        isStoppingService = false
        stopCurrentBoardSession(emitDisconnected = false, updateNotification = false)
        refreshLiveHistoryLimit()
        VescForegroundService.reloadAlertRules(service.applicationContext)
        boardConfig = start.boardConfig
        selectedBoardName = start.boardConfig.deviceName
        sessionSequence += 1
        val session = BoardSession(id = sessionSequence)
        boardSession = session
        when (val transport = start.boardConfig.transport) {
            BoardTransport.Direct -> {
                canId = null
                directConnection = true
            }
            is BoardTransport.Can -> {
                canId = transport.canId
                directConnection = false
            }
            null -> {
                canId = null
                directConnection = false
            }
        }
        boardError = null
        telemetry = null
        latestBatterySoc = null
        latestDutyExcluded = false
        loadBatteryConfig(start.boardConfig.appBoardId)
        socWindow.reset()
        telemetryPipeline.beginSession(session, start.boardConfig)
        // Tag telemetry frames with the CAN id resolved from the stored transport.
        telemetryPipeline.updateCanId(canId)
        packetReassembler.reset()
        diagnosticsRecorder.resetTelemetryParseFailedCounters()
        connectionCoordinator.reset()
        reconnectScheduler.cancelAndReset()
        recordingCoordinator.beginBoardSession(start.boardConfig)
        startLocationUpdates()
        setStatus(BoardPhase.Connecting)
        reassertForeground()

        startBleSession(start)
    }

    /**
     * Foreground-service type for the *current* live state. Android 14+ withholds background
     * location from a foreground service whose type omits [ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION],
     * so the LOCATION bit must be present whenever GPS is running — including during a board
     * session, where it sits alongside CONNECTED_DEVICE. A single hardcoded type silently starves
     * GPS recording while the app is backgrounded, so every state change re-asserts this.
     */
    private fun foregroundServiceType(): Int {
        var type = 0
        if (boardConfig != null) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
        if (gpsMonitor.active) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        return if (type != 0) type else ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
    }

    private fun reassertForeground() {
        val notification = presenter.build(reportedBoardPhase())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            service.startForeground(NOTIFICATION_ID, notification, foregroundServiceType())
        } else {
            service.startForeground(NOTIFICATION_ID, notification)
        }
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
            if (!intentional) configController.onSessionTerminated("Board disconnected during Refloat config op")
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

    /** GATT callbacks can arrive on Binder threads; only this scheduler mutates Board Session state. */
    private fun dispatchGattEvent(event: () -> Unit) {
        val session = boardSession ?: return
        scheduler.post {
            if (isCurrentBoardSession(session)) event()
        }
    }

    private fun resolveBleConnect() {
        val start = connectionCoordinator.resolvePending() ?: return
        Log.d(VESC_SESSION_TAG, "connect resolved attempt=${connectionCoordinator.connectAttempt} canId=$canId")
        boardError = null
        recordLocalDiagnostic(
            "waiting_for_telemetry_started",
            start.boardConfig,
            "connect",
            mapOf("message" to "Waiting for board telemetry"),
        )
        transitionBoardPhase(BoardPhase.WaitingForTelemetry)
        presenter.show(reportedBoardPhase())
        start.onSuccess()
        startPolling()
    }

    private fun handleFrameChunk(chunk: ByteArray) {
        recordingCoordinator.recordChunk("rx", chunk)
        for (payload in packetReassembler.feed(chunk)) {
            handlePayload(payload)
        }
    }

    private fun handlePayload(payload: ByteArray) {
        if (payload.isEmpty()) return
        lastReceivedCommandByte = payload[0].toInt() and 0xff
        when (payload[0].toInt() and 0xff) {
            COMM_FW_VERSION -> handleFwVersionPayload(payload)
            COMM_BMS_GET_VALUES -> handleBmsPayload(payload)
            COMM_GET_CUSTOM_CONFIG_XML -> configController.onPayload(ConfigRWEvent.XmlPayloadReceived(payload))
            COMM_GET_CUSTOM_CONFIG -> configController.onPayload(
                ConfigRWEvent.ConfigBytesPayloadReceived(payload, System.currentTimeMillis()),
            )
            COMM_SET_CUSTOM_CONFIG -> configController.onPayload(ConfigRWEvent.SetConfigResponseReceived(payload))
            COMM_FORWARD_CAN -> {
                if (payload.size >= 3) {
                    when (payload[2].toInt() and 0xff) {
                        COMM_BMS_GET_VALUES -> handleBmsPayload(payload.copyOfRange(2, payload.size))
                        COMM_FW_VERSION -> handleFwVersionPayload(payload.copyOfRange(2, payload.size))
                        COMM_GET_CUSTOM_CONFIG_XML -> configController.onPayload(ConfigRWEvent.XmlPayloadReceived(payload))
                        COMM_GET_CUSTOM_CONFIG -> configController.onPayload(
                            ConfigRWEvent.ConfigBytesPayloadReceived(payload, System.currentTimeMillis()),
                        )
                        COMM_SET_CUSTOM_CONFIG -> configController.onPayload(ConfigRWEvent.SetConfigResponseReceived(payload))
                    }
                }
            }
            COMM_CUSTOM_APP_DATA -> {
                val now = System.currentTimeMillis()
                val parsed = parseRefloatGetAllData(
                    payload = payload,
                    avgLatency = updateLatency(now),
                    packetAt = now,
                    location = locationTracker.latestLocation,
                    pullRateHz = pollingLoop.measuredRateHz(),
                ) ?: run {
                    captureTelemetryParseFailed(payload)
                    return
                }
                val sessionToken = boardSession ?: return
                pollingLoop.onResponse()
                val processed = telemetryPipeline.process(parsed, sessionToken) ?: return
                markBoardReady()
                telemetry = parsed
                val batteryPct = BatterySocEstimator.estimateBatteryPercent(
                    parsed.batteryVoltage,
                    batteryConfigCache,
                    parsed.batteryCurrent,
                )
                // Smooth the IR-compensated % into the Battery SoC Estimate; display + alerts share it.
                val batteryEstimate = batteryPct?.let { socWindow.median(it, now) }
                val firedAlerts = evaluateAlerts(parsed, batteryEstimate)
                val eventMap = processed.eventMap
                // Latest cold-path values for the dedicated watch tick (ADR-0019); the tick pushes them
                // on its own cadence, so the wrist sees the same SoC Estimate + duty nulling as the phone.
                latestBatterySoc = batteryEstimate
                latestDutyExcluded = (eventMap["metricExclusions"] as? Map<*, *>)?.get(METRIC_MAX_DUTY) == true
                if (firedAlerts.isNotEmpty()) eventMap["firedAlerts"] = firedAlerts
                eventMap["generation"] = currentSessionId
                eventMap["batteryPercent"] = batteryEstimate
                val historySample = if (processed.metricExclusionUpdates.isNotEmpty()) {
                    eventMap + mapOf("metricExclusionUpdates" to processed.metricExclusionUpdates)
                } else eventMap
                refreshNotification(telemetry = parsed, batteryPercent = batteryEstimate)
                // Hot path: tiny scalar tick every frame drives the live gauges (SharedValues, no React render).
                emitEvent("onLiveTick", buildLiveTick(parsed, batteryEstimate, currentSessionId, firedAlerts))
                // Cold path: full samples buffered and flushed in batches for history/charts.
                liveSeriesEmitter.enqueueHistorySample(historySample)
                // First sample of the session also drives the first sparkline frame immediately.
                liveSeriesEmitter.primeLiveSeriesIfNeeded()
                updateIdlePause(processed.capture)
                // Skip persistence while paused; live display, watch, and presence keep running off the
                // paths above. When recording is off, recordTelemetry is already a no-op.
                if (!idlePauseDetector.isPaused) {
                    recordingCoordinator.recordTelemetry(processed.capture)
                }
            }
        }
    }

    private fun handleBmsPayload(payload: ByteArray) {
        val bms = parseBmsValues(payload, System.currentTimeMillis()) ?: return
        emitEvent("onBms", bms.toMap())
    }

    private fun handleFwVersionPayload(payload: ByteArray) {
        val hex = payload.joinToString(" ") { "%02x".format(it) }
        Log.d(VESC_SESSION_TAG, "FW version raw (${payload.size} bytes): $hex")
        fwVersionString = parseFwVersion(payload) ?: return
        Log.d(VESC_SESSION_TAG, "FW version: $fwVersionString")
    }

    private fun dumpRefloatConfigDebug(xmlBytes: ByteArray, configBytes: ByteArray) {
        try {
            val dir = File(service.filesDir, "refloat-debug").apply { mkdirs() }
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

    private fun startPolling() {
        val session = boardConfig ?: return
        val sessionToken = boardSession ?: return
        val transport = currentBoardTransport() ?: return
        // Arm the board-ready timeout only once telemetry polling actually begins.
        // A stale stored transport still reaches this path and times out into reconnect.
        if (boardStatus == BoardPhase.WaitingForTelemetry) {
            armBoardReadyTimeout(session)
        }
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
        idlePauseDetector.reset()
        pollingLoop.start(session, sessionToken, transport)
        liveSeriesEmitter.start()
        watchMirrorPresence.start()
        watchTick.start()
    }

    private fun currentBoardTransport(): BoardTransport? = boardTransport(canId, directConnection)

    private fun stopPolling() {
        pollingLoop.stop()
        idlePauseDetector.reset()
        telemetryPipeline.cancelStaleWatchdog()
        liveSeriesEmitter.stop()
        watchTick.stop()
        watchMirrorPresence.stop()
    }

    /** Latest cold-path snapshot the watch tick pushes; null until the first sample / after a reset. */
    private fun watchSnapshot(): WatchSnapshot? {
        val current = telemetry ?: return null
        return WatchSnapshot(
            speed = current.speed,
            dutyCycle = current.dutyCycle,
            dutyExcluded = latestDutyExcluded,
            batterySoc = latestBatterySoc,
            motorTemp = current.tempMotor,
            ctrlTemp = current.tempMosfet,
        )
    }

    private fun isTelemetryStale(now: Long = System.currentTimeMillis()): Boolean =
        now - telemetryPipeline.lastTelemetryAt >= TELEMETRY_STALE_MS

    private fun buildLiveTick(
        parsed: RefloatTelemetry,
        batteryPercent: Double?,
        generation: Long,
        firedAlerts: List<Map<String, Any?>>,
    ): Map<String, Any?> {
        val tick = parsed.toMap().toMutableMap()
        tick.remove("location")
        tick["batteryPercent"] = batteryPercent
        tick["generation"] = generation
        tick["remoteTilt"] = remoteTiltState()
        if (firedAlerts.isNotEmpty()) tick["firedAlerts"] = firedAlerts
        return tick
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
        // A telemetry frame can land in flight after the rider tore the session down
        // (stop, or a stale GATT delivering one last packet). Promoting to Connected here
        // would resurrect a dead session with a null board config — the notification then
        // shows 0 km/h / 0% and disconnect can never settle. Only promote from a live phase.
        if (isStoppingService ||
            boardStatus == BoardPhase.Disconnecting ||
            boardStatus == BoardPhase.Idle ||
            boardConfig == null
        ) {
            return
        }
        cancelBoardReadyTimeout()
        if (shouldStartPollingOnReady(canId, directConnection, pollingLoop.takeIf { it.isActive })) {
            startPolling()
        }
        if (boardStatus == BoardPhase.Connected) return
        reconnectScheduler.resetAttempts()
        boardError = null
        recordLocalDiagnostic(
            "board_ready",
            boardConfig,
            "connect",
            mapOf("message" to "Board telemetry received"),
        )
        boardConfig?.let { recordingCoordinator.markBoardReady(it) }
        if (connectionSoundsEnabled) alertFeedback.playConnect()
        transitionBoardPhase(BoardPhase.Connected)
    }

    private fun onTelemetryStaleFired() {
        val now = System.currentTimeMillis()
        if (
            boardStatus != BoardPhase.Connected ||
            now - telemetryPipeline.lastTelemetryAt < TELEMETRY_STALE_MS
        ) return

        transitionBoardPhase(BoardPhase.Stale)
        refreshNotification()
        boardConfig?.takeIf { it.autoReconnect }?.let {
            scheduleAutoReconnect(it, null, "telemetry stale")
        }
    }

    private fun sendPayload(payload: ByteArray): Boolean {
        lastSentCommand = payload.getOrNull(0)?.toInt()?.and(0xff)
        return gattClient.sendPayload(payload)
    }

    fun setRemoteTilt(value: Int): Boolean = remoteTiltController.hold(value)

    fun lockRemoteTilt(value: Int): Boolean = remoteTiltController.lock(value)

    fun releaseRemoteTilt(value: Int, durationMs: Long): Boolean =
        remoteTiltController.release(value, durationMs)

    fun stopRemoteTilt(): Boolean = remoteTiltController.stop()

    fun remoteTiltState(): Map<String, Any?>? =
        remoteTiltWire(
            remoteTiltController.currentValue,
            remoteTiltController.phase,
            remoteTiltController.decayProgress,
        )

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
        remoteTiltController.stop()
        flushTelemetryDiagnostics("stop")
        configController.onSessionTerminated("Board session stopped during Refloat config op")
        val stoppedConfig = boardConfig
        reconnectScheduler.cancelAndReset()
        cancelBoardReadyTimeout()
        stopPolling()
        gattClient.clear(markIntentional = true)
        alertCoordinator.stopAllGeiger()
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
        boardConfig = null
        boardError = null
        transitionBoardPhase(BoardPhase.Idle)
        if (updateNotification && !isStoppingService && stoppedConfig != null) {
            presenter.show(reportedBoardPhase())
        }
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
        refreshNotification(errorMessage = message)
        recordingCoordinator.failSession()
        start.onError(code, message)
    }

    /** Sole raw Board phase writer; all rider-facing phase derives from this raw state. */
    private fun transitionBoardPhase(
        next: BoardPhase,
        recordName: String? = null,
        recordProperties: Map<String, Any?> = emptyMap(),
    ) {
        boardStatus = next
        recordName?.let { recordingCoordinator.recordState(it, recordProperties) }
        emitState()
    }

    private fun setStatus(next: BoardPhase) =
        transitionBoardPhase(next, recordName = next.recordName())

    private fun scheduleAutoReconnect(session: SessionConfig, gattStatus: Int?, reason: String) {
        if (!session.autoReconnect || isStoppingService) return
        val reconnectSession = boardSession ?: return
        // Lost a live link (telemetry was flowing) — signal the rider we're now without telemetry.
        // Fires once at loss: subsequent reconnect attempts enter here as Reconnecting/Rescanning.
        if (connectionSoundsEnabled && (boardStatus == BoardPhase.Connected || boardStatus == BoardPhase.Stale)) {
            alertFeedback.playDisconnect()
        }
        reconnectScheduler.schedule(
            session = reconnectSession,
            targetDeviceId = session.deviceId,
            reason = reason,
            gattStatus = gattStatus,
        )
    }

    private fun setError(message: String) {
        boardError = message
        recordingCoordinator.recordError(boardConfig, message)
        emitEvent("onError", mapOf("message" to message))
        transitionBoardPhase(BoardPhase.Error)
    }

    private fun reportedBoardPhase(nowMs: Long = System.currentTimeMillis()): BoardPhase =
        deriveReportedBoardPhase(
            ReportedBoardPhaseInput(
                rawPhase = boardStatus,
                hasBoardConfig = boardConfig != null,
                hasActiveBoardSession = boardSession?.let(::isCurrentBoardSession) == true,
                isStoppingService = isStoppingService,
                lastTelemetryAt = telemetryPipeline.lastTelemetryAt,
                nowMs = nowMs,
            ),
        )

    fun refreshNotification(
        telemetry: RefloatTelemetry? = this.telemetry,
        batteryPercent: Double? = telemetry?.let {
            BatterySocEstimator.estimateBatteryPercent(it.batteryVoltage, batteryConfigCache, it.batteryCurrent)
        },
        errorMessage: String? = boardError,
    ) {
        if (isStoppingService) return
        presenter.show(
            phase = reportedBoardPhase(),
            telemetry = telemetry,
            batteryPercent = batteryPercent,
            errorMessage = errorMessage,
        )
    }

    private fun emitState() {
        emitEvent("onLiveState", liveStateMap())
    }

    private fun emitEvent(name: String, body: Map<String, Any?>) {
        VescForegroundService.emitEvent?.invoke(name, body)
    }

    private fun startLocationUpdates() {
        gpsError = gpsMonitor.start()
        if (gpsError != null) emitState()
    }

    private fun stopLocationUpdates() {
        gpsMonitor.stop()
    }

    fun setTelemetryRecordingEnabled(enabled: Boolean) {
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

        resetIdlePause()
        recordingCoordinator.disableTelemetryRecording(session)
        emitState()
    }

    private fun onLocationUpdated(location: Location) {
        locationTracker.onLocationUpdated(location)
        latestRiderPresence()?.let(groupRideObserver::pushPresence)
    }

    private fun latestRiderPresence(): RiderPresence? {
        val location = locationTracker.latestPreciseLocation ?: locationTracker.latestLocation ?: return null
        // Privacy Zone egress gate (issue #144): freeze the group dot while inside a zone. Local GPS
        // keeps ticking; only the broadcast is suppressed, resuming automatically on exit.
        if (isInsidePrivacyZone(location)) return null
        val currentTelemetry = telemetry
        val telemetryFresh = currentTelemetry != null && !isTelemetryStale()
        return RiderPresence(
            lat = location.latitude,
            lng = location.longitude,
            heading = location.bearingDeg,
            speed = if (telemetryFresh) currentTelemetry?.speed?.let { kotlin.math.abs(it) / 3.6 } else null,
            soc = if (telemetryFresh) latestBatterySoc?.let { (it / 100.0).coerceIn(0.0, 1.0) } else null,
            boardName = if (boardConfig != null) (boardConfig?.deviceName ?: selectedBoardName) else null,
        )
    }

    private fun isInsidePrivacyZone(location: LocationSnapshot): Boolean {
        val zones = groupRidePrivacyZones
        if (zones.isEmpty()) return false
        val latitudeE7 = (location.latitude * 10_000_000.0).roundToInt()
        val longitudeE7 = (location.longitude * 10_000_000.0).roundToInt()
        return isInsideAnyPrivacyZone(latitudeE7, longitudeE7, zones)
    }

    /** Refresh the Group Ride presence zone gate from native storage (observe start + zone CRUD). */
    suspend fun loadPrivacyZones(context: Context) {
        groupRidePrivacyZones = try {
            AppDataRepository.get(context).getEnabledPrivacyZoneEntities()
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Failed to load privacy zones for presence gate: ${e.message}")
            emptyList()
        }
    }

    fun liveStateMap(includeRecent: Boolean = false): Map<String, Any?> {
        val settings = kotlinx.coroutines.runBlocking {
            AppDataRepository.get(service.applicationContext).getTypedSettings()
        }
        applyTelemetrySettings(settings)
        val recentTelemetryValue = if (includeRecent) telemetryPipeline.recentSnapshot() else emptyList()
        val recentLocationsValue = if (includeRecent) locationTracker.recentLocations() else emptyList()

        return buildLiveState(
            VescLiveStateSnapshot(
                boardPhase = reportedBoardPhase(),
                boardConfig = boardConfig,
                boardError = boardError,
                connectionSeq = currentSessionId,
                lastTelemetryAt = telemetry?.lastPacketAt,
                recentTelemetry = recentTelemetryValue,
                gpsActive = gpsMonitor.active,
                latestLocation = locationTracker.latestLocation,
                latestPreciseLocation = locationTracker.latestPreciseLocation,
                recentLocations = recentLocationsValue,
                gpsError = gpsError,
                recordingEnabled = recordingCoordinator.telemetryRecordingEnabled,
                recordingPaused = idlePauseDetector.isPaused,
                remoteTiltValue = remoteTiltController.currentValue,
                remoteTiltPhase = remoteTiltController.phase,
                remoteTiltDecay = remoteTiltController.decayProgress,
                settings = settings,
            )
        )
    }

    suspend fun loadAlertRules(context: Context) {
        try {
            val rules = AppDataRepository.get(context).getEnabledAlertRuleEntities()
            alertCoordinator.replaceRules(rules)
            Log.d(VESC_SESSION_TAG, "Loaded ${rules.size} alert rule(s)")
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Failed to load alert rules: ${e.message}")
            alertCoordinator.replaceRules(emptyList())
        }
    }

    fun reloadBatteryConfigForActiveBoard() {
        loadBatteryConfig(boardConfig?.appBoardId)
    }

    private fun loadBatteryConfig(appBoardId: String?) {
        if (appBoardId == null) {
            batteryConfigCache = null
            return
        }
        batteryConfigCache = try {
            val board = kotlinx.coroutines.runBlocking {
                AppDataRepository.get(service.applicationContext).getBoard(appBoardId)
            }
            board?.get("batteryConfig") as? Map<String, Any?>
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Failed to load battery config: ${e.message}")
            null
        }
    }

    private fun evaluateAlerts(t: RefloatTelemetry, batteryPercent: Double?): List<Map<String, Any?>> =
        alertCoordinator.evaluate(t, batteryPercent) { name, properties ->
            val batteryProperties = if (name == "battery_alert_fired") properties + mapOf("battery_config_loaded" to (batteryConfigCache != null)) else properties
            recordLocalDiagnostic(name, boardConfig, "alert", batteryProperties)
        }

    fun applyLiveHistoryLimitMinutes(minutes: Int) {
        telemetryPipeline.setLiveHistoryLimitMinutes(minutes)
        locationTracker.pruneRecentLocations(System.currentTimeMillis())
    }

    private fun refreshLiveHistoryLimit() {
        val settings = kotlinx.coroutines.runBlocking {
            AppDataRepository.get(service.applicationContext).getTypedSettings()
        }
        applyTelemetrySettings(settings)
    }

    suspend fun loadTelemetrySettings(context: Context) {
        applyTelemetrySettings(AppDataRepository.get(context).getTypedSettings())
    }

    private fun applyTelemetrySettings(settings: AppSettings) {
        applyTelemetryPipelineSettings(settings)
        recordingCoordinator.applySettings(settings)
        socWindow.windowMs = settings.socEstimateWindowSeconds * 1000L
        connectionSoundsEnabled = settings.connectionSoundsEnabled
        configuredPollIntervalMs = pollIntervalMsForHz(settings.telemetryPollRateHz)
        movingThresholdCentiKmh = settings.toMetricSanitizerConfig().movingSpeedThresholdCentiKmh
        pollingLoop.setPollIntervalMs(effectivePollIntervalMs())
        watchTick.setIntervalMs(settings.wearMirrorIntervalMs.toLong())
    }

    /** Poll spacing honoring an active Idle Pause: never faster than the configured rate. */
    private fun effectivePollIntervalMs(): Long =
        if (idlePauseDetector.isPaused) maxOf(IDLE_PAUSE_POLL_INTERVAL_MS, configuredPollIntervalMs)
        else configuredPollIntervalMs

    private fun updateIdlePause(capture: TelemetryCapture) {
        if (!recordingCoordinator.telemetryRecordingEnabled) {
            // Recording turned off mid-pause: drop the pause and restore the configured poll rate.
            if (idlePauseDetector.isPaused) {
                resetIdlePause()
                emitState()
            }
            return
        }
        val transition = idlePauseDetector.onSample(
            speedCentiKmh = (capture.speed * 100.0).roundToInt(),
            movingThresholdCentiKmh = movingThresholdCentiKmh,
            atMs = capture.capturedAtMs,
        ) ?: return
        if (transition == IdlePauseTransition.Paused) {
            recordingCoordinator.recordIdlePauseMarker(boardConfig)
        }
        pollingLoop.setPollIntervalMs(effectivePollIntervalMs())
        emitState()
    }

    private fun resetIdlePause() {
        idlePauseDetector.reset()
        pollingLoop.setPollIntervalMs(effectivePollIntervalMs())
    }

    private fun applyTelemetryPipelineSettings(settings: AppSettings) {
        applyLiveHistoryLimitMinutes(settings.liveHistoryLimit)
        telemetryPipeline.metricSanitizerConfig = settings.toMetricSanitizerConfig()
    }

    fun previewAlertSound(soundType: String) {
        alertFeedback.preview(soundType)
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
