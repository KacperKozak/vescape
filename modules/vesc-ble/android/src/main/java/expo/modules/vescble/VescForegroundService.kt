package expo.modules.vescble

import android.annotation.SuppressLint
import android.app.Notification
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import expo.modules.vescble.telemetry.AlertRuleEntity
import expo.modules.vescble.telemetry.AppDataRepository
import expo.modules.vescble.telemetry.TelemetryLocationCapture
import expo.modules.vescble.telemetry.TelemetryRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

internal const val VESC_SESSION_TAG = "VescSession"
private const val CHANNEL_ID = "vesc_monitoring_v4"
private const val NOTIFICATION_ID = 1001
private const val ACTION_START_SESSION = "expo.modules.vescble.ACTION_START_SESSION"
private const val ACTION_STOP_SESSION = "expo.modules.vescble.ACTION_STOP_SESSION"
private const val ACTION_EXIT_FROM_NOTIFICATION = "expo.modules.vescble.ACTION_EXIT_FROM_NOTIFICATION"
private const val ACTION_START_GPS_MONITORING = "expo.modules.vescble.ACTION_START_GPS_MONITORING"
private const val ACTION_STOP_GPS_MONITORING = "expo.modules.vescble.ACTION_STOP_GPS_MONITORING"

private const val MAX_RECORDING_ACCURACY_M = 20.0
private const val DEFAULT_LIVE_HISTORY_LIMIT_MINUTES = 5
private const val MIN_LIVE_HISTORY_LIMIT_MINUTES = 1
private const val MAX_LIVE_HISTORY_LIMIT_MINUTES = 50
private const val TELEMETRY_STALE_MS = 2_500L
private const val BOARD_READY_TIMEOUT_MS = 4_000L

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

@SuppressLint("MissingPermission")
class VescForegroundService : Service() {
    companion object {
        var emitEvent: ((String, Map<String, Any?>) -> Unit)? = null

        private var instance: VescForegroundService? = null
        private var appInForeground = true
        private var pendingStart: PendingStart? = null
        private var pendingStop: PendingStop? = null
        private var pendingGpsStart = false
        private var requestedTelemetryRecordingEnabled = false
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
            requestedTelemetryRecordingEnabled = enabled
            instance?.setTelemetryRecordingEnabled(enabled)
            if (!enabled) TelemetryRepository.get(context.applicationContext).flushBlocking()
        }

        fun setLiveHistoryLimit(limit: Number?) {
            val minutes = (limit?.toInt() ?: DEFAULT_LIVE_HISTORY_LIMIT_MINUTES)
                .coerceIn(MIN_LIVE_HISTORY_LIMIT_MINUTES, MAX_LIVE_HISTORY_LIMIT_MINUTES)
            requestedLiveHistoryLimitMinutes = minutes
            instance?.setLiveHistoryLimitMinutes(minutes)
        }

        @Volatile private var alertRules: List<AlertRuleEntity> = emptyList()

        fun reloadAlertRules(context: Context) {
            appDataScope.launch {
                instance?.loadAlertRules(context.applicationContext)
            }
        }

        fun previewAlertSound(context: Context, soundType: String) {
            instance?.alertFeedback?.playTone(soundType, null) ?: VescAlertFeedback.preview(soundType)
        }

        fun currentLiveState(context: Context): Map<String, Any?> =
            instance?.liveStateMap(includeRecent = true)
                ?: idleState(AppDataRepository.get(context.applicationContext))

        fun setAppInForeground(active: Boolean) {
            if (appInForeground == active) return
            appInForeground = active
            instance?.showNotification()
        }

        private fun idleState(repository: AppDataRepository): Map<String, Any?> {
            val settings = kotlinx.coroutines.runBlocking { repository.getSettingsEntity() }
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

    private data class PendingStart(
        val boardConfig: SessionConfig,
        val onSuccess: () -> Unit,
        val onError: (String, String) -> Unit,
    )

    private data class PendingStop(val onSuccess: () -> Unit)

    private val mainHandler = Handler(Looper.getMainLooper())
    private val packetReassembler = VescPacketReassembler()
    private val rttHistory = ArrayDeque<Long>()
    private val notificationController by lazy {
        VescNotificationController(
            service = this,
            serviceClass = VescForegroundService::class.java,
            channelId = CHANNEL_ID,
            notificationId = NOTIFICATION_ID,
            stopAction = ACTION_EXIT_FROM_NOTIFICATION,
        )
    }
    private val alertEngine = VescAlertEngine()
    private val alertFeedback by lazy { VescAlertFeedback(this, mainHandler) }
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
            recorder = { recorder },
            listener = gattListener,
        )
    }

    private var boardConfig: SessionConfig? = null
    private var boardStatus: BoardPhase = BoardPhase.Idle
    private var boardError: String? = null
    private var telemetry: RefloatTelemetry? = null
    private var canId: Int? = null
    private var connectTimeout: Runnable? = null
    private var boardReadyTimeout: Runnable? = null
    private var pendingConnect: PendingStart? = null
    private var pollRunnable: Runnable? = null
    private var telemetryStaleRunnable: Runnable? = null
    private var lastPollAt = 0L
    private var lastTelemetryAt = 0L
    private var connectAttempt = 0
    private var recorder: VescSessionRecorder? = null
    private var telemetryStore: TelemetryRepository? = null
    private var gpsError: String? = null
    private var latestLocation: LocationSnapshot? = null
    private var isStoppingService = false
    private var autoReconnectRunnable: Runnable? = null
    private var reconnectScanCallback: ScanCallback? = null
    private var autoReconnectAttempt = 0
    private var generation = 0L
    private var liveHistoryLimitMinutes = requestedLiveHistoryLimitMinutes
    private val recentTelemetry = ArrayDeque<Map<String, Any?>>()
    private val recentLocations = ArrayDeque<Map<String, Any?>>()
    private val bluetoothAdapter: BluetoothAdapter
        get() = (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
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
        stopLocationUpdates()
        instance = null
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
            startForeground(NOTIFICATION_ID, buildNotification("Monitoring GPS"))
        } else {
            showNotification()
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
        generation += 1
        canId = start.boardConfig.canId
        boardError = null
        telemetry = null
        recentTelemetry.clear()
        packetReassembler.reset()
        gattClient.resetDiagnostics()
        connectAttempt = 0
        autoReconnectAttempt = 0
        lastTelemetryAt = 0L
        if (start.boardConfig.recordingEnabled) {
            recorder = VescSessionRecorder(this, start.boardConfig).also { it.start() }
        }
        telemetryStore = if (start.boardConfig.telemetryRecordingEnabled || requestedTelemetryRecordingEnabled) {
            TelemetryRepository.get(applicationContext)
        } else {
            null
        }
        startLocationUpdates()
        setStatus(BoardPhase.Connecting)
        startForeground(NOTIFICATION_ID, buildNotification("Connecting..."))

        startBleSession(start)
    }

    private fun startBleSession(start: PendingStart) {
        val deviceId = start.boardConfig.deviceId
        if (deviceId.isNullOrBlank()) {
            failStart(start, "INVALID_DEVICE", "Board session requires deviceId")
            return
        }
        pendingConnect = start
        connectAttempt++
        cancelConnectTimeout()
        stopReconnectScan()
        val device = bluetoothAdapter.getRemoteDevice(deviceId)
        gattClient.connect(device)
        connectTimeout = Runnable {
            if (pendingConnect == start) {
                failStart(start, "CONNECT_TIMEOUT", "Timed out connecting to board")
            }
        }
        mainHandler.postDelayed(connectTimeout!!, 12_000)
        Log.d(VESC_SESSION_TAG, "connectGatt $deviceId attempt=$connectAttempt")
    }

    private val gattListener = object : VescGattListener {
        override fun onGattConnected() {
            setStatus(BoardPhase.Discovering)
        }

        override fun onGattSubscribing() {
            setStatus(BoardPhase.Subscribing)
        }

        override fun onGattDisconnected(status: Int, intentional: Boolean) {
            val wasConnecting = pendingConnect
            cancelConnectTimeout()
            stopPolling()
            if (intentional) {
                return
            } else if (wasConnecting != null) {
                if (status == 133 && connectAttempt < 2) {
                    Log.w(VESC_SESSION_TAG, "status=133 during connect, retrying once")
                    mainHandler.postDelayed({ startBleSession(wasConnecting) }, 250)
                } else if (wasConnecting.boardConfig.autoReconnect) {
                    scheduleAutoReconnect(wasConnecting.boardConfig, status, "connect failed")
                } else {
                    failStart(wasConnecting, "DISCONNECTED", "Device disconnected during connect (status=$status)")
                }
            } else if (boardConfig?.autoReconnect == true) {
                scheduleAutoReconnect(boardConfig!!, status, "board disconnected")
            } else {
                setError("Board disconnected")
                finishRecording("error")
            }
        }

        override fun onGattReady() {
            resolveBleConnect()
        }

        override fun onGattFailure(code: String, message: String) {
            failPendingConnect(code, message)
        }

        override fun onGattFrameChunk(chunk: ByteArray) {
            handleFrameChunk(chunk)
        }
    }

    private fun resolveBleConnect() {
        cancelConnectTimeout()
        val start = pendingConnect ?: return
        pendingConnect = null
        boardStatus = BoardPhase.WaitingForTelemetry
        boardError = null
        emitState()
        showNotification("Discovering board...")
        start.onSuccess()
        mainHandler.postDelayed({ sendPayload(byteArrayOf(COMM_FW_VERSION.toByte())) }, 500)
        mainHandler.postDelayed({ sendPayload(byteArrayOf(COMM_PING_CAN.toByte())) }, 800)
        if (canId != null) startPolling()
        armBoardReadyTimeout(start.boardConfig)
    }

    private fun handleFrameChunk(chunk: ByteArray) {
        recorder?.recordChunk("rx", chunk)
        for (payload in packetReassembler.feed(chunk)) {
            handlePayload(payload)
        }
    }

    private fun handlePayload(payload: ByteArray) {
        if (payload.isEmpty()) return
        when (payload[0].toInt() and 0xff) {
            COMM_PING_CAN -> {
                if (payload.size > 1) {
                    canId = payload[1].toInt() and 0xff
                    emitState()
                    startPolling()
                }
            }
            COMM_CUSTOM_APP_DATA -> {
                val now = System.currentTimeMillis()
                val parsed = parseRefloatGetAllData(
                    payload = payload,
                    avgLatency = updateLatency(now),
                    packetAt = now,
                    location = latestLocation,
                ) ?: return
                markBoardReady()
                telemetry = parsed
                lastTelemetryAt = parsed.lastPacketAt
                armTelemetryStaleWatchdog()
                val firedAlerts = evaluateAlerts(parsed)
                val eventMap = if (firedAlerts.isNotEmpty())
                    parsed.toMap() + mapOf("firedAlerts" to firedAlerts, "generation" to generation)
                else
                    parsed.toMap() + mapOf("generation" to generation)
                appendRecentTelemetry(eventMap, parsed.lastPacketAt)
                showNotification(formatNotificationText(parsed))
                emitEvent("onTelemetry", eventMap)
                recordTelemetry(parsed)
            }
        }
    }

    private fun startPolling() {
        val session = boardConfig ?: return
        val id = canId ?: return
        stopPolling()
        armTelemetryStaleWatchdog()
        pollRunnable = object : Runnable {
            override fun run() {
                lastPollAt = System.currentTimeMillis()
                sendPayload(byteArrayOf(
                    COMM_FORWARD_CAN.toByte(),
                    id.toByte(),
                    COMM_CUSTOM_APP_DATA.toByte(),
                    REFLOAT_MAGIC.toByte(),
                    REFLOAT_GET_ALLDATA.toByte(),
                    2,
                ))
                mainHandler.postDelayed(this, session.pollIntervalMs)
            }
        }
        mainHandler.post(pollRunnable!!)
    }

    private fun stopPolling() {
        pollRunnable?.let { mainHandler.removeCallbacks(it) }
        pollRunnable = null
        telemetryStaleRunnable?.let { mainHandler.removeCallbacks(it) }
        telemetryStaleRunnable = null
    }

    private fun armBoardReadyTimeout(session: SessionConfig) {
        if (!session.autoReconnect) return
        cancelBoardReadyTimeout()
        boardReadyTimeout = Runnable {
            boardReadyTimeout = null
            if (
                (boardStatus == BoardPhase.Connecting || boardStatus == BoardPhase.WaitingForTelemetry) &&
                boardConfig?.autoReconnect == true &&
                telemetry == null
            ) {
                scheduleAutoReconnect(session, null, "board telemetry unavailable")
            }
        }
        mainHandler.postDelayed(boardReadyTimeout!!, BOARD_READY_TIMEOUT_MS)
    }

    private fun cancelBoardReadyTimeout() {
        boardReadyTimeout?.let { mainHandler.removeCallbacks(it) }
        boardReadyTimeout = null
    }

    private fun markBoardReady() {
        cancelBoardReadyTimeout()
        if (boardStatus == BoardPhase.Connected) return
        autoReconnectAttempt = 0
        boardStatus = BoardPhase.Connected
        val autoRecording = try {
            kotlinx.coroutines.runBlocking {
                AppDataRepository.get(applicationContext).getSettingsEntity().autoRecording
            }
        } catch (_: Exception) {
            false
        }
        if (autoRecording && telemetryStore == null) {
            telemetryStore = TelemetryRepository.get(applicationContext)
        }
        boardError = null
        telemetryStore?.recordMarker("connected", boardConfig?.deviceId, boardConfig?.deviceName)
        emitState()
    }

    private fun armTelemetryStaleWatchdog() {
        val session = boardConfig ?: return
        if (!session.autoReconnect) return
        telemetryStaleRunnable?.let { mainHandler.removeCallbacks(it) }
        val armedAt = lastTelemetryAt
        telemetryStaleRunnable = Runnable {
            telemetryStaleRunnable = null
            val stillStale = lastTelemetryAt == armedAt ||
                System.currentTimeMillis() - lastTelemetryAt >= TELEMETRY_STALE_MS
            if (boardStatus == BoardPhase.Connected && boardConfig?.autoReconnect == true && stillStale) {
                boardStatus = BoardPhase.Stale
                emitState()
                scheduleAutoReconnect(session, null, "telemetry stale")
            }
        }
        mainHandler.postDelayed(telemetryStaleRunnable!!, TELEMETRY_STALE_MS)
    }

    private fun sendPayload(payload: ByteArray): Boolean {
        return gattClient.sendPayload(payload)
    }

    private fun updateLatency(now: Long): Int? {
        if (lastPollAt <= 0) return null
        rttHistory.addLast(max(0, now - lastPollAt))
        while (rttHistory.size > 5) rttHistory.removeFirst()
        return rttHistory.average().roundToInt()
    }

    private fun stopCurrentBoardSession(emitDisconnected: Boolean, updateNotification: Boolean = true) {
        val stoppedConfig = boardConfig
        autoReconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        autoReconnectRunnable = null
        stopReconnectScan()
        cancelConnectTimeout()
        cancelBoardReadyTimeout()
        stopPolling()
        gattClient.clear(markIntentional = true)
        finishRecording(if (emitDisconnected) "disconnected" else "stopped")
        telemetryStore?.recordMarker(
            if (emitDisconnected) "disconnected" else "app_stop",
            stoppedConfig?.deviceId,
            stoppedConfig?.deviceName,
        )
        telemetryStore?.flushBlocking()
        telemetryStore = null
        pendingConnect = null
        canId = null
        telemetry = null
        recentTelemetry.clear()
        generation += 1
        boardError = null
        boardStatus = BoardPhase.Idle
        boardConfig = null
        if (updateNotification && !isStoppingService && stoppedConfig != null) showNotification()
        emitState()
    }

    private fun finishRecording(status: String) {
        recorder?.finish(status = status)
        recorder = null
    }

    private fun failPendingConnect(code: String, message: String) {
        pendingConnect?.let { failStart(it, code, message) }
    }

    private fun failStart(start: PendingStart, code: String, message: String) {
        if (start.boardConfig.autoReconnect) {
            scheduleAutoReconnect(start.boardConfig, null, message)
            start.onError(code, message)
            return
        }
        pendingConnect = null
        cancelConnectTimeout()
        cancelBoardReadyTimeout()
        stopPolling()
        gattClient.clear(markIntentional = true)
        setError(message)
        showNotification(message)
        finishRecording("error")
        telemetryStore?.flushBlocking()
        telemetryStore = null
        start.onError(code, message)
    }

    private fun setStatus(next: BoardPhase) {
        boardStatus = next
        recorder?.recordState(next.recordName())
        emitState()
    }

    private fun scheduleAutoReconnect(session: SessionConfig, gattStatus: Int?, reason: String) {
        if (!session.autoReconnect || isStoppingService) return
        pendingConnect = null
        cancelConnectTimeout()
        cancelBoardReadyTimeout()
        stopPolling()
        gattClient.clear(markIntentional = false)
        lastTelemetryAt = 0L
        boardStatus = BoardPhase.Reconnecting
        boardError = reason
        autoReconnectAttempt += 1
        recorder?.recordState(
            "reconnecting",
            mapOf("attempt" to autoReconnectAttempt, "status" to gattStatus),
        )
        emitState()
        showNotification("Reconnecting...")

        autoReconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        val delayMs = minOf(250L * autoReconnectAttempt, 2_000L)
        val retry = Runnable {
            autoReconnectRunnable = null
            if (boardConfig?.autoReconnect == true && boardStatus == BoardPhase.Reconnecting) {
                startReconnectScan(session)
            }
        }
        autoReconnectRunnable = retry
        mainHandler.postDelayed(retry, delayMs)
    }

    private fun startReconnectScan(session: SessionConfig) {
        val targetId = session.deviceId
        if (targetId.isNullOrBlank()) {
            scheduleAutoReconnect(session, null, "missing reconnect target")
            return
        }
        stopReconnectScan()
        val scanner = bluetoothAdapter.bluetoothLeScanner
        if (scanner == null) {
            scheduleAutoReconnect(session, null, "BLE scanner unavailable")
            return
        }

        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                if (!result.device.address.equals(targetId, ignoreCase = true)) return
                stopReconnectScan()
                if (boardConfig?.autoReconnect == true && boardStatus == BoardPhase.Reconnecting) {
                    connectAttempt = 0
                    boardStatus = BoardPhase.Connecting
                    boardError = null
                    emitState()
                    startBleSession(PendingStart(session, onSuccess = {}, onError = { _, _ -> }))
                }
            }

            override fun onScanFailed(errorCode: Int) {
                Log.w(VESC_SESSION_TAG, "Reconnect scan failed errorCode=$errorCode")
                stopReconnectScan()
                scheduleAutoReconnect(session, null, "reconnect scan failed ($errorCode)")
            }
        }

        reconnectScanCallback = callback
        try {
            scanner.startScan(
                null,
                ScanSettings.Builder()
                    .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                    .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
                    .build(),
                callback,
            )
            Log.d(VESC_SESSION_TAG, "Reconnect scan started for $targetId")
        } catch (e: Exception) {
            reconnectScanCallback = null
            Log.w(VESC_SESSION_TAG, "Reconnect scan start failed: ${e.message}")
            scheduleAutoReconnect(session, null, "reconnect scan start failed")
        }
    }

    private fun stopReconnectScan() {
        val callback = reconnectScanCallback ?: return
        reconnectScanCallback = null
        try {
            bluetoothAdapter.bluetoothLeScanner?.stopScan(callback)
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Reconnect scan stop failed: ${e.message}")
        }
    }

    private fun setError(message: String) {
        boardStatus = BoardPhase.Error
        boardError = message
        recorder?.recordState("error", mapOf("message" to message))
        telemetryStore?.recordMarker("error", boardConfig?.deviceId, boardConfig?.deviceName, message)
        emitEvent("onError", mapOf("message" to message))
        emitState()
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
                requestedTelemetryRecordingEnabled = false
                emitEvent("onError", mapOf("message" to "Recording requires a connected board"))
                emitState()
                return
            }
            if (telemetryStore == null) {
                telemetryStore = TelemetryRepository.get(applicationContext)
                telemetryStore?.recordMarker("connected", session.deviceId, session.deviceName, null)
            }
            emitState()
            return
        }

        telemetryStore?.recordMarker(
            "app_stop",
            session?.deviceId,
            session?.deviceName,
            "Recording stopped",
        )
        telemetryStore?.flushBlocking()
        telemetryStore = null
        emitState()
    }

    private fun onLocationUpdated(location: Location) {
        val speedMps = if (location.hasSpeed()) location.speed.toDouble() else null
        val bearingDeg = if (location.hasBearing()) location.bearing.toDouble() else null
        val accuracyM = if (location.hasAccuracy()) location.accuracy.toDouble() else null
        val altitudeM = if (location.hasAltitude()) location.altitude else null
        val precise = isRecordableGpsLocation(location, accuracyM)
        val capture = TelemetryLocationCapture(
            latitude = location.latitude,
            longitude = location.longitude,
            speedMps = speedMps,
            bearingDeg = bearingDeg,
            accuracyM = accuracyM,
            altitudeM = altitudeM,
            timestamp = location.time,
            precise = precise,
        )
        val saved = if (precise) {
            telemetryStore?.recordLocation(
                capture,
                deviceId = boardConfig?.deviceId,
                deviceName = boardConfig?.deviceName,
            ) ?: false
        } else {
            false
        }
        val snapshot = LocationSnapshot(
            latitude = location.latitude,
            longitude = location.longitude,
            speedMps = speedMps,
            bearingDeg = bearingDeg,
            accuracyM = accuracyM,
            altitudeM = altitudeM,
            timestamp = location.time,
            precise = precise,
            saved = saved,
        )
        latestLocation = snapshot
        appendRecentLocation(snapshot)
        emitEvent("onLocation", snapshot.toMap())
        if (boardConfig == null) showNotification(formatGpsNotificationText(snapshot))
        if (snapshot.precise) recorder?.recordLocation(snapshot)
    }

    private fun isRecordableGpsLocation(location: Location, accuracyM: Double?): Boolean =
        location.provider == LocationManager.GPS_PROVIDER &&
            accuracyM != null &&
            accuracyM <= MAX_RECORDING_ACCURACY_M

    private fun liveStateMap(includeRecent: Boolean = false): Map<String, Any?> {
        val settings = kotlinx.coroutines.runBlocking {
            AppDataRepository.get(applicationContext).getSettingsEntity()
        }
        setLiveHistoryLimitMinutes(settings.liveHistoryLimit)
        val now = System.currentTimeMillis()
        val phase = if (
            boardStatus == BoardPhase.Connected &&
            lastTelemetryAt > 0L &&
            now - lastTelemetryAt >= TELEMETRY_STALE_MS
        ) BoardPhase.Stale else boardStatus
        val recentTelemetryValue = if (includeRecent) recentTelemetry.toList() else emptyList()
        val recentLocationsValue = if (includeRecent) recentLocations.toList() else emptyList()

        return buildLiveState(
            VescLiveStateSnapshot(
                boardPhase = phase,
                boardConfig = boardConfig,
                boardError = boardError,
                connectionSeq = generation,
                lastTelemetryAt = telemetry?.lastPacketAt,
                recentTelemetry = recentTelemetryValue,
                gpsActive = gpsMonitor.active,
                latestLocation = latestLocation,
                recentLocations = recentLocationsValue,
                gpsError = gpsError,
                recordingEnabled = telemetryStore != null,
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

    private fun evaluateAlerts(t: RefloatTelemetry): List<Map<String, Any?>> {
        val fired = alertEngine.evaluate(alertRules, t)
        if (fired.isNotEmpty()) {
            val first = fired.first()
            val rangeDepth = (first["rangeDepth"] as? Number)?.toDouble()
            alertFeedback.playTone(first["soundType"] as? String ?: "default", rangeDepth)
            alertFeedback.vibrate(rangeDepth)
        }
        return fired
    }

    private fun appendRecentTelemetry(point: Map<String, Any?>, packetAt: Long) {
        recentTelemetry.addLast(point)
        pruneRecent(recentTelemetry, packetAt)
    }

    private fun appendRecentLocation(location: LocationSnapshot) {
        val point = location.toMap()
        recentLocations.addLast(point)
        pruneRecent(recentLocations, location.timestamp)
    }

    private fun pruneRecent(points: ArrayDeque<Map<String, Any?>>, nowMs: Long) {
        val oldest = nowMs - recentWindowMs()
        while (points.isNotEmpty()) {
            val timestamp = (points.first()["lastPacketAt"] as? Number)?.toLong()
                ?: (points.first()["timestamp"] as? Number)?.toLong()
                ?: break
            if (timestamp >= oldest) break
            points.removeFirst()
        }
    }

    private fun recentWindowMs(): Long = liveHistoryLimitMinutes.toLong() * 60_000L

    private fun setLiveHistoryLimitMinutes(minutes: Int) {
        liveHistoryLimitMinutes = minutes.coerceIn(
            MIN_LIVE_HISTORY_LIMIT_MINUTES,
            MAX_LIVE_HISTORY_LIMIT_MINUTES,
        )
        pruneRecent(recentTelemetry, System.currentTimeMillis())
        pruneRecent(recentLocations, System.currentTimeMillis())
    }

    private fun refreshLiveHistoryLimit() {
        val settings = kotlinx.coroutines.runBlocking {
            AppDataRepository.get(applicationContext).getSettingsEntity()
        }
        setLiveHistoryLimitMinutes(settings.liveHistoryLimit)
    }

    private fun showNotification(text: String = "Monitoring board in background") {
        notificationController.show(text, boardConfig?.deviceName, appInForeground)
    }

    private fun buildNotification(text: String = "Monitoring board in background"): Notification {
        return notificationController.build(text, boardConfig?.deviceName, appInForeground)
    }

    private fun closeAppTask() {
        notificationController.closeAppTask()
    }

    private fun cancelConnectTimeout() {
        connectTimeout?.let { mainHandler.removeCallbacks(it) }
        connectTimeout = null
    }

    private fun formatNotificationText(values: RefloatTelemetry): String {
        if (values.hasFault) return "Fault ${values.faultCode}"
        val dutyPercent = if (abs(values.dutyCycle) <= 0.01) 0.0 else values.dutyCycle * 100.0
        return String.format(
            "%.1f km/h | %.0f%% duty | %.1fV",
            abs(values.speed),
            dutyPercent,
            values.batteryVoltage,
        )
    }

    private fun formatGpsNotificationText(location: LocationSnapshot): String {
        val speedKmh = (location.speedMps ?: 0.0) * 3.6
        return String.format("GPS %.1f km/h", abs(speedKmh))
    }

    private fun recordTelemetry(values: RefloatTelemetry) {
        val session = boardConfig ?: return
        telemetryStore?.recordTelemetry(values.toCapture(session, canId))
    }
}
