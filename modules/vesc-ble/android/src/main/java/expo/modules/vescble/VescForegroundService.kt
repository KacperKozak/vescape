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
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import java.io.File
import expo.modules.vescble.telemetry.AlertRuleEntity
import expo.modules.vescble.telemetry.AppDataRepository
import expo.modules.vescble.telemetry.BucketTelemetryPoint
import expo.modules.vescble.telemetry.FullTelemetryState
import expo.modules.vescble.telemetry.METRIC_MAX_DUTY
import expo.modules.vescble.telemetry.METRIC_MAX_SPEED
import expo.modules.vescble.telemetry.SanitizedSample
import expo.modules.vescble.telemetry.TelemetryRepository
import expo.modules.vescble.telemetry.sanitizeTelemetrySamples
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

private const val LAST_GPS_PERSIST_INTERVAL_MS = 30_000L
private const val DEFAULT_LIVE_HISTORY_LIMIT_MINUTES = 5
private const val MIN_LIVE_HISTORY_LIMIT_MINUTES = 1
private const val MAX_LIVE_HISTORY_LIMIT_MINUTES = 50
private const val TELEMETRY_STALE_MS = 2_500L
private const val BOARD_READY_TIMEOUT_MS = 4_000L
private const val GATT_CONNECT_TIMEOUT_MS = 4_000L
private const val GATT_READY_TIMEOUT_MS = 4_000L
private const val RECONNECT_SCAN_TIMEOUT_MS = 4_000L

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
        private var pendingConfigRead: PendingConfigRead? = null
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
            instance?.alertFeedback?.preview(soundType) ?: VescAlertFeedback.preview(context, soundType)
        }

        fun alertSoundPresets(): List<Map<String, Any>> = alertSoundPresetMaps()

        fun currentLiveState(context: Context): Map<String, Any?> =
            instance?.liveStateMap(includeRecent = true)
                ?: idleState(AppDataRepository.get(context.applicationContext))

        fun setAppInForeground(active: Boolean) {
            if (appInForeground == active) return
            appInForeground = active
            instance?.showNotification()
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

    private data class PendingStart(
        val boardConfig: SessionConfig,
        val onSuccess: () -> Unit,
        val onError: (String, String) -> Unit,
    )

    private data class PendingStop(val onSuccess: () -> Unit)
    private data class LiveTelemetryPoint(
        val bucketPoint: BucketTelemetryPoint,
        val eventMap: MutableMap<String, Any?>,
    )

    private data class PendingConfigRead(
        val onSuccess: (Map<String, Any?>) -> Unit,
        val onError: (String, String) -> Unit,
    )
    private data class ActiveConfigRead(
        val pending: PendingConfigRead,
        val wasPolling: Boolean,
        val operationId: String = newOperationId(),
        val xmlBytes: ByteArray = ByteArray(0),
        val expectedXmlLength: Int? = null,
        val nextXmlOffset: Int = 0,
        val rawConfig: ByteArray? = null,
    )

    private data class PendingConfigWrite(
        val profileId: String,
        val onSuccess: (Map<String, Any?>) -> Unit,
        val onError: (String, String) -> Unit,
    )

    private enum class ConfigWritePhase {
        READING_SCHEMA,
        READING_CONFIG,
        SENDING_WRITE,
        VERIFYING,
    }

    private data class ActiveConfigWrite(
        val pending: PendingConfigWrite,
        val wasPolling: Boolean,
        val profileFields: Map<String, Any>,
        val operationId: String = newOperationId(),
        val phase: ConfigWritePhase = ConfigWritePhase.READING_SCHEMA,
        val xmlBytes: ByteArray = ByteArray(0),
        val expectedXmlLength: Int? = null,
        val nextXmlOffset: Int = 0,
        val originalConfig: ByteArray? = null,
        val patchedConfig: ByteArray? = null,
        val schema: RefloatConfigSchema? = null,
    )

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
    private var activeGeigerRuleIds: Set<String> = emptySet()
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
    private var fwVersionString: String? = null
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
    private var latestPreciseLocation: LocationSnapshot? = null
    private var lastGpsPersistedAt = 0L
    private var isStoppingService = false
    private var autoReconnectRunnable: Runnable? = null
    private var reconnectScanCallback: ScanCallback? = null
    private var reconnectScanTimeout: Runnable? = null
    private var activeConfigRead: ActiveConfigRead? = null
    private var activeConfigWrite: ActiveConfigWrite? = null
    private var configTimeoutRunnable: Runnable? = null
    private var autoReconnectAttempt = 0
    private var telemetryParseFailedReported = false
    private var telemetryParseFailedCount = 0
    private var lastSentCommand: Int? = null
    private var lastReceivedCommandByte: Int? = null
    private var connectionLostMarkerAt: Long? = null
    private var generation = 0L
    private var liveHistoryLimitMinutes = requestedLiveHistoryLimitMinutes
    private val configChunkLength = 384
    private val configSchemaTimeoutMs = 10_000L
    private val configReadTimeoutMs = 8_000L
    private val configWriteTimeoutMs = 10_000L
    private val recentTelemetry = ArrayDeque<Map<String, Any?>>()
    private val liveTelemetryPoints = ArrayDeque<LiveTelemetryPoint>()
    private val recentLocations = ArrayDeque<Map<String, Any?>>()
    private val bluetoothAdapter: BluetoothAdapter
        get() = (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
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
        if (activeConfigRead != null || activeConfigWrite != null) {
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
        val id = canId
        if (id == null) {
            pending.onError(
                RefloatConfigErrorCode.CAN_ID_UNAVAILABLE.name,
                "Cannot read Refloat config before CAN id discovery",
            )
            return
        }
        val wasPolling = pollRunnable != null
        stopPolling()
        activeConfigRead = ActiveConfigRead(
            pending = pending,
            wasPolling = wasPolling,
        )
        sendNextConfigXmlChunk(id)
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
        liveTelemetryPoints.clear()
        packetReassembler.reset()
        gattClient.resetDiagnostics()
        telemetryParseFailedReported = false
        telemetryParseFailedCount = 0
        connectAttempt = 0
        autoReconnectAttempt = 0
        lastTelemetryAt = 0L
        if (start.boardConfig.recordingEnabled) {
            recorder = VescSessionRecorder(this, start.boardConfig).also { it.start() }
        }
        telemetryStore = if (start.boardConfig.telemetryRecordingEnabled || requestedTelemetryRecordingEnabled) {
            configuredTelemetryStore()
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
        armConnectPhaseTimeout(start, "gatt_connect", GATT_CONNECT_TIMEOUT_MS)
        Log.d(
            VESC_SESSION_TAG,
            "connect start device=$deviceId attempt=$connectAttempt autoReconnect=${start.boardConfig.autoReconnect}",
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
                pendingConnect?.boardConfig ?: boardConfig,
                "connect",
                mapOf("message" to "GATT connected"),
            )
            setStatus(BoardPhase.Discovering)
            pendingConnect?.let { armConnectPhaseTimeout(it, "gatt_ready", GATT_READY_TIMEOUT_MS) }
        }

        override fun onGattSubscribing() {
            Log.d(VESC_SESSION_TAG, "connect phase: subscribing")
            recordLocalDiagnostic(
                "gatt_subscribing",
                pendingConnect?.boardConfig ?: boardConfig,
                "connect",
                mapOf("message" to "GATT subscribing"),
            )
            setStatus(BoardPhase.Subscribing)
        }

        override fun onGattDisconnected(status: Int, intentional: Boolean) {
            val wasConnecting = pendingConnect
            Log.w(
                VESC_SESSION_TAG,
                "gatt disconnected status=$status intentional=$intentional wasConnecting=${wasConnecting != null} boardStatus=$boardStatus",
            )
            cancelConnectTimeout()
            stopPolling()
            if (!intentional && activeConfigRead != null) {
                failConfigRead(
                    RefloatConfigErrorCode.BOARD_NOT_CONNECTED,
                    "Board disconnected during Refloat config read",
                    resumePolling = false,
                )
            }
            if (!intentional && activeConfigWrite != null) {
                failConfigWrite(
                    RefloatConfigErrorCode.BOARD_NOT_CONNECTED,
                    "Board disconnected during config write",
                )
            }
            if (intentional) {
                return
            } else if (wasConnecting != null) {
                if (status == 133 && connectAttempt < 2) {
                    Log.w(VESC_SESSION_TAG, "status=133 during connect, retrying once")
                    mainHandler.postDelayed({ startBleSession(wasConnecting) }, 250)
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
                finishRecording("error")
            }
        }

        override fun onGattReady() {
            Log.d(VESC_SESSION_TAG, "connect phase: gatt ready")
            recordLocalDiagnostic(
                "gatt_ready",
                pendingConnect?.boardConfig ?: boardConfig,
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
        cancelConnectTimeout()
        val start = pendingConnect ?: return
        Log.d(VESC_SESSION_TAG, "connect resolved attempt=$connectAttempt canId=$canId")
        pendingConnect = null
        boardStatus = BoardPhase.WaitingForTelemetry
        boardError = null
        recordLocalDiagnostic(
            "waiting_for_telemetry_started",
            start.boardConfig,
            "connect",
            mapOf("message" to "Waiting for board telemetry"),
        )
        emitState()
        showNotification("Discovering board...")
        start.onSuccess()
        if (canId != null) {
            startPolling()
        } else {
            mainHandler.postDelayed({ sendStartupPayload(byteArrayOf(COMM_FW_VERSION.toByte())) }, 500)
            mainHandler.postDelayed({ sendStartupPayload(byteArrayOf(COMM_PING_CAN.toByte())) }, 800)
        }
        armBoardReadyTimeout(start.boardConfig)
    }

    private fun handleFrameChunk(chunk: ByteArray) {
        recorder?.recordChunk("rx", chunk)
        for (payload in packetReassembler.feed(chunk)) {
            handlePayload(payload)
        }
    }

    private fun sendStartupPayload(payload: ByteArray) {
        if (activeConfigRead != null || activeConfigWrite != null) return
        sendPayloadWithRetry(payload)
    }

    private fun handlePayload(payload: ByteArray) {
        if (payload.isEmpty()) return
        lastReceivedCommandByte = payload[0].toInt() and 0xff
        when (payload[0].toInt() and 0xff) {
            COMM_FW_VERSION -> handleFwVersionPayload(payload)
            COMM_PING_CAN -> {
                if (payload.size > 1) {
                    canId = payload[1].toInt() and 0xff
                    emitState()
                    startPolling()
                    sendPayloadWithRetry(byteArrayOf(
                        COMM_FORWARD_CAN.toByte(),
                        (payload[1].toInt() and 0xff).toByte(),
                        COMM_FW_VERSION.toByte(),
                    ))
                }
            }
            COMM_GET_CUSTOM_CONFIG_XML -> handleConfigXmlPayload(payload)
            COMM_GET_CUSTOM_CONFIG -> handleConfigBytesPayload(payload)
            COMM_SET_CUSTOM_CONFIG -> handleSetConfigResponse(payload)
            COMM_FORWARD_CAN -> {
                if (payload.size >= 3) {
                    when (payload[2].toInt() and 0xff) {
                        COMM_FW_VERSION -> handleFwVersionPayload(payload.copyOfRange(2, payload.size))
                        COMM_GET_CUSTOM_CONFIG_XML -> handleConfigXmlPayload(payload)
                        COMM_GET_CUSTOM_CONFIG -> handleConfigBytesPayload(payload)
                        COMM_SET_CUSTOM_CONFIG -> handleSetConfigResponse(payload)
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
                markBoardReady()
                telemetry = parsed
                lastTelemetryAt = parsed.lastPacketAt
                armTelemetryStaleWatchdog()
                val firedAlerts = evaluateAlerts(parsed)
                val baseEventMap = parsed.toMap().toMutableMap()
                if (firedAlerts.isNotEmpty()) baseEventMap["firedAlerts"] = firedAlerts
                baseEventMap["generation"] = generation
                val eventMap = appendLiveTelemetry(parsed, baseEventMap)
                showNotification(formatNotificationText(parsed))
                emitEvent("onTelemetry", eventMap)
                recordTelemetry(parsed)
            }
        }
    }

    private fun handleConfigXmlPayload(payload: ByteArray) {
        if (activeConfigWrite != null) {
            handleWriteXmlPayload(payload)
            return
        }
        val active = activeConfigRead ?: return
        val parsed = when (val result = RefloatConfigProtocol.parseCustomConfigXmlResponse(payload)) {
            is RefloatConfigProtocolResult.Success -> result.value
            is RefloatConfigProtocolResult.Failure -> {
                failConfigRead(
                    RefloatConfigErrorCode.UNEXPECTED_CONFIG_RESPONSE,
                    result.message,
                )
                return
            }
        }
        clearConfigTimeout()
        val merged = ByteArray(active.xmlBytes.size + parsed.chunk.size)
        active.xmlBytes.copyInto(merged)
        parsed.chunk.copyInto(merged, active.xmlBytes.size)
        val nextOffset = parsed.offset + parsed.chunk.size
        activeConfigRead = active.copy(
            xmlBytes = merged,
            expectedXmlLength = parsed.totalLength,
            nextXmlOffset = nextOffset,
        )
        val id = canId ?: run {
            failConfigRead(
                RefloatConfigErrorCode.CAN_ID_UNAVAILABLE,
                "CAN id unavailable during Refloat config read",
            )
            return
        }
        if (nextOffset >= parsed.totalLength) {
            sendConfigBytesRequest(id)
        } else {
            sendNextConfigXmlChunk(id)
        }
    }

    private fun handleConfigBytesPayload(payload: ByteArray) {
        if (activeConfigWrite != null) {
            handleWriteConfigBytesPayload(payload)
            return
        }
        val active = activeConfigRead ?: return
        val parsed = when (val result = RefloatConfigProtocol.parseCustomConfigResponse(payload)) {
            is RefloatConfigProtocolResult.Success -> result.value
            is RefloatConfigProtocolResult.Failure -> {
                failConfigRead(
                    RefloatConfigErrorCode.UNEXPECTED_CONFIG_RESPONSE,
                    result.message,
                )
                return
            }
        }
        activeConfigRead = active.copy(rawConfig = parsed.config)
        clearConfigTimeout()
        val can = canId ?: run {
            failConfigRead(
                RefloatConfigErrorCode.CAN_ID_UNAVAILABLE,
                "CAN id unavailable during Refloat config read",
            )
            return
        }
        try {
            val schema = RefloatConfigSchemaParser.parse(active.xmlBytes)
            val snapshot = RefloatConfigDecoder.decode(
                schema = schema,
                rawConfig = parsed.config,
                boardId = boardConfig?.appBoardId,
                canId = can,
                capturedAt = System.currentTimeMillis(),
                fwVersion = fwVersionString,
            )
            completeConfigRead(snapshot)
        } catch (e: RefloatConfigSchemaException) {
            dumpRefloatConfigDebug(active.xmlBytes, parsed.config)
            failConfigRead(
                RefloatConfigErrorCode.UNSUPPORTED_SCHEMA,
                e.message ?: "Unsupported Refloat config schema",
            )
        } catch (e: RefloatConfigDecodeException) {
            dumpRefloatConfigDebug(active.xmlBytes, parsed.config)
            failConfigRead(
                RefloatConfigErrorCode.CONFIG_DECODE_FAILED,
                e.message ?: "Failed to decode Refloat config",
            )
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Unexpected Refloat config read failure", e)
            dumpRefloatConfigDebug(active.xmlBytes, parsed.config)
            failConfigRead(
                RefloatConfigErrorCode.CONFIG_DECODE_FAILED,
                e.message ?: "Failed to read Refloat config",
            )
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

    private fun sendNextConfigXmlChunk(id: Int) {
        val active = activeConfigRead ?: return
        val offset = active.nextXmlOffset
        val expected = active.expectedXmlLength
        val length = (if (expected == null) configChunkLength else (expected - offset).coerceAtMost(configChunkLength))
            .coerceAtLeast(0)
        armConfigTimeout(RefloatConfigErrorCode.CONFIG_SCHEMA_TIMEOUT, configSchemaTimeoutMs)
        val sent = sendPayload(
            RefloatConfigProtocol.buildGetCustomConfigXml(
                canId = id,
                confInd = 0,
                length = length,
                offset = offset,
            ),
        )
        if (!sent) {
            failConfigRead(RefloatConfigErrorCode.GATT_NOT_WRITABLE, "Board GATT is not writable")
        }
    }

    private fun sendConfigBytesRequest(id: Int) {
        armConfigTimeout(RefloatConfigErrorCode.CONFIG_READ_TIMEOUT, configReadTimeoutMs)
        val sent = sendPayload(RefloatConfigProtocol.buildGetCustomConfig(canId = id, confInd = 0))
        if (!sent) {
            failConfigRead(RefloatConfigErrorCode.GATT_NOT_WRITABLE, "Board GATT is not writable")
        }
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

    private fun armConfigTimeout(code: RefloatConfigErrorCode, timeoutMs: Long) {
        clearConfigTimeout()
        configTimeoutRunnable = Runnable {
            failConfigRead(code, "Timed out reading Refloat config")
        }
        mainHandler.postDelayed(configTimeoutRunnable!!, timeoutMs)
    }

    private fun clearConfigTimeout() {
        configTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        configTimeoutRunnable = null
    }

    private fun completeConfigRead(snapshot: RefloatConfigSnapshot) {
        val active = activeConfigRead ?: return
        activeConfigRead = null
        clearConfigTimeout()
        if (active.wasPolling && boardConfig != null && canId != null) {
            startPolling()
        }
        appDataScope.launch {
            try {
                AppDataRepository.get(applicationContext).createMainTuneProfileIfMissing(snapshot)
            } catch (e: Exception) {
                Log.w(VESC_SESSION_TAG, "Failed to auto-create main tune profile", e)
            }
            mainHandler.post {
                active.pending.onSuccess(snapshot.toMap())
            }
        }
    }

    private fun failConfigRead(code: RefloatConfigErrorCode, message: String) {
        failConfigRead(code, message, resumePolling = true)
    }

    private fun failConfigRead(code: RefloatConfigErrorCode, message: String, resumePolling: Boolean) {
        val active = activeConfigRead ?: return
        activeConfigRead = null
        clearConfigTimeout()
        if (resumePolling && active.wasPolling && boardConfig != null && canId != null) {
            startPolling()
        }
        captureDiagnostic(
            if (code == RefloatConfigErrorCode.CONFIG_DECODE_FAILED || code == RefloatConfigErrorCode.UNSUPPORTED_SCHEMA) {
                "config_decode_failed"
            } else {
                "config_read_failed"
            },
            diagnosticProperties(boardConfig, "config_read") + mapOf(
                "operation_id" to active.operationId,
                "message" to message,
                "error_code" to code.name,
                "firmware" to fwVersionString,
            ) + DiagnosticReporter.configBlobProperties(active.rawConfig),
        )
        active.pending.onError(code.name, message)
    }

    // --- Config write flow (push profile to board) ---

    private fun consumePendingConfigWrite() {
        val pending = pendingConfigWrite ?: return
        pendingConfigWrite = null
        if (activeConfigRead != null || activeConfigWrite != null) {
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
        val id = canId
        if (id == null) {
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
                mainHandler.post {
                    pending.onError(
                        RefloatConfigErrorCode.PROFILE_NOT_FOUND.name,
                        "Tune profile not found: ${pending.profileId}",
                    )
                }
                return@launch
            }
            @Suppress("UNCHECKED_CAST")
            val fields = (profile["fields"] as? Map<String, Any>) ?: emptyMap()
            mainHandler.post {
                if (activeConfigRead != null || activeConfigWrite != null) {
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
                val currentId = canId
                if (currentId == null) {
                    pending.onError(
                        RefloatConfigErrorCode.CAN_ID_UNAVAILABLE.name,
                        "Cannot push config before CAN id discovery",
                    )
                    return@post
                }
                val wasPolling = pollRunnable != null
                stopPolling()
                activeConfigWrite = ActiveConfigWrite(
                    pending = pending,
                    wasPolling = wasPolling,
                    profileFields = fields,
                )
                sendNextWriteXmlChunk(currentId)
            }
        }
    }

    private fun sendNextWriteXmlChunk(id: Int) {
        val active = activeConfigWrite ?: return
        val offset = active.nextXmlOffset
        val expected = active.expectedXmlLength
        val length = (if (expected == null) configChunkLength else (expected - offset).coerceAtMost(configChunkLength))
            .coerceAtLeast(0)
        armConfigTimeout(RefloatConfigErrorCode.CONFIG_SCHEMA_TIMEOUT, configSchemaTimeoutMs)
        val sent = sendPayload(
            RefloatConfigProtocol.buildGetCustomConfigXml(
                canId = id, confInd = 0, length = length, offset = offset,
            ),
        )
        if (!sent) {
            failConfigWrite(RefloatConfigErrorCode.GATT_NOT_WRITABLE, "Board GATT is not writable")
        }
    }

    private fun handleWriteXmlPayload(payload: ByteArray) {
        val active = activeConfigWrite ?: return
        val parsed = when (val result = RefloatConfigProtocol.parseCustomConfigXmlResponse(payload)) {
            is RefloatConfigProtocolResult.Success -> result.value
            is RefloatConfigProtocolResult.Failure -> {
                failConfigWrite(RefloatConfigErrorCode.UNEXPECTED_CONFIG_RESPONSE, result.message)
                return
            }
        }
        clearConfigTimeout()
        val merged = ByteArray(active.xmlBytes.size + parsed.chunk.size)
        active.xmlBytes.copyInto(merged)
        parsed.chunk.copyInto(merged, active.xmlBytes.size)
        val nextOffset = parsed.offset + parsed.chunk.size
        activeConfigWrite = active.copy(
            xmlBytes = merged,
            expectedXmlLength = parsed.totalLength,
            nextXmlOffset = nextOffset,
        )
        val id = canId ?: run {
            failConfigWrite(RefloatConfigErrorCode.CAN_ID_UNAVAILABLE, "CAN id lost during write")
            return
        }
        if (nextOffset >= parsed.totalLength) {
            activeConfigWrite = activeConfigWrite?.copy(phase = ConfigWritePhase.READING_CONFIG)
            armConfigTimeout(RefloatConfigErrorCode.CONFIG_READ_TIMEOUT, configReadTimeoutMs)
            val sent = sendPayload(RefloatConfigProtocol.buildGetCustomConfig(canId = id, confInd = 0))
            if (!sent) {
                failConfigWrite(RefloatConfigErrorCode.GATT_NOT_WRITABLE, "Board GATT is not writable")
            }
        } else {
            sendNextWriteXmlChunk(id)
        }
    }

    private fun handleWriteConfigBytesPayload(payload: ByteArray) {
        val active = activeConfigWrite ?: return
        val parsed = when (val result = RefloatConfigProtocol.parseCustomConfigResponse(payload)) {
            is RefloatConfigProtocolResult.Success -> result.value
            is RefloatConfigProtocolResult.Failure -> {
                failConfigWrite(RefloatConfigErrorCode.UNEXPECTED_CONFIG_RESPONSE, result.message)
                return
            }
        }
        clearConfigTimeout()
        val id = canId ?: run {
            failConfigWrite(RefloatConfigErrorCode.CAN_ID_UNAVAILABLE, "CAN id lost during write")
            return
        }

        when (active.phase) {
            ConfigWritePhase.READING_CONFIG -> {
                try {
                    val schema = RefloatConfigSchemaParser.parse(active.xmlBytes)
                    val patched = RefloatConfigEncoder.encode(schema, parsed.config, active.profileFields)
                    activeConfigWrite = active.copy(
                        phase = ConfigWritePhase.SENDING_WRITE,
                        originalConfig = parsed.config,
                        patchedConfig = patched,
                        schema = schema,
                    )
                    armConfigTimeout(RefloatConfigErrorCode.CONFIG_WRITE_TIMEOUT, configWriteTimeoutMs)
                    val sent = sendPayload(RefloatConfigProtocol.buildSetCustomConfig(id, 0, patched))
                    if (!sent) {
                        failConfigWrite(RefloatConfigErrorCode.GATT_NOT_WRITABLE, "Board GATT is not writable")
                    }
                } catch (e: RefloatConfigSchemaException) {
                    failConfigWrite(RefloatConfigErrorCode.UNSUPPORTED_SCHEMA, e.message ?: "Unsupported schema")
                } catch (e: RefloatConfigEncodeException) {
                    failConfigWrite(RefloatConfigErrorCode.CONFIG_ENCODE_FAILED, e.message ?: "Encode failed")
                } catch (e: Exception) {
                    failConfigWrite(RefloatConfigErrorCode.CONFIG_WRITE_FAILED, e.message ?: "Write failed")
                }
            }
            ConfigWritePhase.VERIFYING -> {
                val schema = active.schema
                val patchedConfig = active.patchedConfig
                if (schema == null || patchedConfig == null) {
                    failConfigWrite(RefloatConfigErrorCode.CONFIG_WRITE_FAILED, "Missing state for verification")
                    return
                }
                try {
                    when (val verification = RefloatConfigWriteVerifier.verifyExactBytes(patchedConfig, parsed.config)) {
                        is RefloatConfigWriteVerification.Success -> Unit
                        is RefloatConfigWriteVerification.Failure -> {
                            Log.w(VESC_SESSION_TAG, verification.message)
                            failConfigWrite(
                                RefloatConfigErrorCode.CONFIG_VERIFY_FAILED,
                                verification.message,
                            )
                            return
                        }
                    }
                    val actualSnapshot = RefloatConfigDecoder.decode(schema, parsed.config, boardConfig?.appBoardId, id, System.currentTimeMillis(), fwVersionString)
                    completeConfigWrite(actualSnapshot)
                } catch (e: RefloatConfigDecodeException) {
                    failConfigWrite(RefloatConfigErrorCode.CONFIG_VERIFY_FAILED, e.message ?: "Verification failed")
                } catch (e: Exception) {
                    failConfigWrite(RefloatConfigErrorCode.CONFIG_VERIFY_FAILED, e.message ?: "Verification failed")
                }
            }
            else -> {
                failConfigWrite(RefloatConfigErrorCode.CONFIG_WRITE_FAILED, "Unexpected config bytes in phase ${active.phase}")
            }
        }
    }

    private fun handleSetConfigResponse(payload: ByteArray) {
        val active = activeConfigWrite ?: return
        when (val result = RefloatConfigProtocol.parseSetCustomConfigResponse(payload)) {
            is RefloatConfigProtocolResult.Success -> {
                clearConfigTimeout()
                val id = canId ?: run {
                    failConfigWrite(RefloatConfigErrorCode.CAN_ID_UNAVAILABLE, "CAN id lost after write")
                    return
                }
                activeConfigWrite = active.copy(phase = ConfigWritePhase.VERIFYING)
                armConfigTimeout(RefloatConfigErrorCode.CONFIG_READ_TIMEOUT, configReadTimeoutMs)
                val sent = sendPayload(RefloatConfigProtocol.buildGetCustomConfig(canId = id, confInd = 0))
                if (!sent) {
                    failConfigWrite(RefloatConfigErrorCode.GATT_NOT_WRITABLE, "Board GATT is not writable")
                }
            }
            is RefloatConfigProtocolResult.Failure -> {
                failConfigWrite(RefloatConfigErrorCode.CONFIG_WRITE_FAILED, result.message)
            }
        }
    }

    private fun completeConfigWrite(verifiedSnapshot: RefloatConfigSnapshot) {
        val active = activeConfigWrite ?: return
        activeConfigWrite = null
        clearConfigTimeout()
        if (active.wasPolling && boardConfig != null && canId != null) {
            startPolling()
        }
        appDataScope.launch {
            try {
                AppDataRepository.get(applicationContext).createMainTuneProfileIfMissing(verifiedSnapshot)
            } catch (e: Exception) {
                Log.w(VESC_SESSION_TAG, "Failed to update profile after push", e)
            }
            mainHandler.post {
                active.pending.onSuccess(verifiedSnapshot.toMap())
            }
        }
    }

    private fun failConfigWrite(code: RefloatConfigErrorCode, message: String) {
        val active = activeConfigWrite ?: return
        activeConfigWrite = null
        clearConfigTimeout()
        if (active.wasPolling && boardConfig != null && canId != null) {
            startPolling()
        }
        captureDiagnostic(
            "profile_push_failed",
            diagnosticProperties(boardConfig, "profile_push") + mapOf(
                "operation_id" to active.operationId,
                "message" to message,
                "error_code" to code.name,
                "phase" to active.phase.name,
                "firmware" to fwVersionString,
            ) + DiagnosticReporter.configBlobProperties(active.originalConfig ?: active.patchedConfig),
        )
        active.pending.onError(code.name, message)
    }

    private fun startPolling() {
        val session = boardConfig ?: return
        val id = canId ?: return
        stopPolling()
        armTelemetryStaleWatchdog()
        pollRunnable = object : Runnable {
            override fun run() {
                lastPollAt = System.currentTimeMillis()
                sendPayloadWithRetry(byteArrayOf(
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
                recordLocalDiagnostic(
                    "board_ready_timeout",
                    session,
                    "connect",
                    mapOf(
                        "message" to "Board telemetry unavailable before ready timeout",
                        "timeout_ms" to BOARD_READY_TIMEOUT_MS,
                    ),
                )
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
        connectionLostMarkerAt = null
        boardStatus = BoardPhase.Connected
        recordLocalDiagnostic(
            "board_ready",
            boardConfig,
            "connect",
            mapOf("message" to "Board telemetry received"),
        )
        val autoRecording = try {
            kotlinx.coroutines.runBlocking {
                AppDataRepository.get(applicationContext).getTypedSettings().autoRecording
            }
        } catch (_: Exception) {
            false
        }
        if (autoRecording && telemetryStore == null) {
            telemetryStore = configuredTelemetryStore()
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
        lastSentCommand = payload.getOrNull(0)?.toInt()?.and(0xff)
        return gattClient.sendPayload(payload)
    }

    private fun sendPayloadWithRetry(payload: ByteArray): Boolean {
        val sent = sendPayload(payload)
        if (!sent) {
            mainHandler.postDelayed({ sendPayload(payload) }, 120)
        }
        return sent
    }

    private fun updateLatency(now: Long): Int? {
        if (lastPollAt <= 0) return null
        rttHistory.addLast(max(0, now - lastPollAt))
        while (rttHistory.size > 5) rttHistory.removeFirst()
        return rttHistory.average().roundToInt()
    }

    private fun stopCurrentBoardSession(emitDisconnected: Boolean, updateNotification: Boolean = true) {
        flushTelemetryDiagnostics("stop")
        if (activeConfigRead != null) {
            failConfigRead(
                RefloatConfigErrorCode.BOARD_NOT_CONNECTED,
                "Board session stopped during Refloat config read",
                resumePolling = false,
            )
        }
        if (activeConfigWrite != null) {
            failConfigWrite(
                RefloatConfigErrorCode.BOARD_NOT_CONNECTED,
                "Board session stopped during config write",
            )
        }
        val stoppedConfig = boardConfig
        autoReconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        autoReconnectRunnable = null
        stopReconnectScan()
        cancelConnectTimeout()
        cancelBoardReadyTimeout()
        stopPolling()
        gattClient.clear(markIntentional = true)
        alertFeedback.stopAllGeiger()
        activeGeigerRuleIds = emptySet()
        finishRecording(if (emitDisconnected) "disconnected" else "stopped")
        telemetryStore?.recordMarker(
            if (emitDisconnected) "disconnected" else "app_stop",
            stoppedConfig?.deviceId,
            stoppedConfig?.deviceName,
        )
        telemetryStore?.flushBlocking()
        telemetryStore = null
        pendingConnect = null
        connectionLostMarkerAt = null
        canId = null
        fwVersionString = null
        telemetry = null
        recentTelemetry.clear()
        liveTelemetryPoints.clear()
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
        flushTelemetryDiagnostics("reconnect")
        recordConnectionLostMarker(session, reason)
        recordLocalDiagnostic(
            "reconnect_scheduled",
            session,
            "connect",
            mapOf(
                "message" to reason,
                "reason" to reason,
                "gatt_status" to gattStatus,
                "auto_reconnect_next_attempt" to (autoReconnectAttempt + 1),
            ),
        )
        if (reason.contains("telemetry", ignoreCase = true)) {
            captureDiagnostic(
                if (reason.contains("stale", ignoreCase = true)) "telemetry_stale" else "telemetry_unavailable",
                diagnosticProperties(session, "telemetry") + mapOf(
                    "message" to reason,
                    "reason" to reason,
                    "gatt_status" to gattStatus,
                    "auto_reconnect_enabled" to session.autoReconnect,
                    "last_telemetry_timestamp" to lastTelemetryAt.takeIf { it > 0L },
                    "telemetry_parse_failed_count" to telemetryParseFailedCount,
                ),
            )
        }
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
                recordLocalDiagnostic(
                    "reconnect_scan_found",
                    session,
                    "connect",
                    mapOf(
                        "message" to "Reconnect target found",
                        "scan_result_address" to result.device.address,
                        "rssi" to result.rssi,
                    ),
                )
                stopReconnectScan()
                if (boardConfig?.autoReconnect == true && boardStatus == BoardPhase.Rescanning) {
                    startReconnectDirectConnect(session, "scan_found")
                }
            }

            override fun onScanFailed(errorCode: Int) {
                Log.w(VESC_SESSION_TAG, "Reconnect scan failed errorCode=$errorCode")
                recordLocalDiagnostic(
                    "reconnect_scan_failed",
                    session,
                    "connect",
                    mapOf(
                        "message" to "Reconnect scan failed",
                        "error_code" to errorCode,
                    ),
                )
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
            boardStatus = BoardPhase.Rescanning
            emitState()
            recordLocalDiagnostic(
                "reconnect_scan_started",
                session,
                "connect",
                mapOf("message" to "Reconnect scan started"),
            )
            armReconnectScanTimeout(session, callback)
        } catch (e: Exception) {
            reconnectScanCallback = null
            Log.w(VESC_SESSION_TAG, "Reconnect scan start failed: ${e.message}")
            recordLocalDiagnostic(
                "reconnect_scan_start_failed",
                session,
                "connect",
                mapOf(
                    "message" to "Reconnect scan start failed",
                    "error_message" to e.message,
                ),
            )
            scheduleAutoReconnect(session, null, "reconnect scan start failed")
        }
    }

    private fun stopReconnectScan() {
        reconnectScanTimeout?.let { mainHandler.removeCallbacks(it) }
        reconnectScanTimeout = null
        val callback = reconnectScanCallback ?: return
        reconnectScanCallback = null
        try {
            bluetoothAdapter.bluetoothLeScanner?.stopScan(callback)
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Reconnect scan stop failed: ${e.message}")
        }
    }

    private fun armReconnectScanTimeout(session: SessionConfig, callback: ScanCallback) {
        reconnectScanTimeout?.let { mainHandler.removeCallbacks(it) }
        reconnectScanTimeout = Runnable {
            reconnectScanTimeout = null
            if (
                reconnectScanCallback == callback &&
                boardConfig?.autoReconnect == true &&
                boardStatus == BoardPhase.Rescanning
            ) {
                recordLocalDiagnostic(
                    "reconnect_scan_timeout",
                    session,
                    "connect",
                    mapOf(
                        "message" to "Reconnect scan timed out",
                        "timeout_ms" to RECONNECT_SCAN_TIMEOUT_MS,
                    ),
                )
                stopReconnectScan()
                startReconnectDirectConnect(session, "scan_timeout")
            }
        }
        mainHandler.postDelayed(reconnectScanTimeout!!, RECONNECT_SCAN_TIMEOUT_MS)
    }

    private fun startReconnectDirectConnect(session: SessionConfig, reason: String) {
        recordLocalDiagnostic(
            "reconnect_direct_connect_started",
            session,
            "connect",
            mapOf(
                "message" to "Reconnect direct connect started",
                "reason" to reason,
            ),
        )
        connectAttempt = 0
        boardError = null
        setStatus(BoardPhase.Connecting)
        startBleSession(PendingStart(session, onSuccess = {}, onError = { _, _ -> }))
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
                telemetryStore = configuredTelemetryStore()
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

    private fun configuredTelemetryStore(): TelemetryRepository {
        val store = TelemetryRepository.get(applicationContext)
        val threshold = try {
            kotlinx.coroutines.runBlocking {
                AppDataRepository.get(applicationContext).getTypedSettings().movingSpeedThresholdKmh
            }
        } catch (_: Exception) {
            3.0
        }
        store.setMovingSpeedThresholdKmh(threshold)
        return store
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
            if (boardConfig == null) {
                showNotification(formatGpsNotificationText(snapshot))
            }
            return
        }
        latestLocation = snapshot
        latestPreciseLocation = snapshot
        persistLastGpsLocation(snapshot)
        appendRecentLocation(snapshot)
        emitEvent("onLocation", snapshot.toMap())
        if (boardConfig == null) showNotification(formatGpsNotificationText(snapshot))
        recorder?.recordLocation(snapshot)
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
                latestPreciseLocation = latestPreciseLocation,
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
            for (alert in single) {
                alertFeedback.playSingle(alert.soundType)
            }
            alertFeedback.vibrate(null)
        }
        return fired.map { it.toMap() }
    }

    private fun appendRecentTelemetry(point: Map<String, Any?>, packetAt: Long) {
        recentTelemetry.addLast(point)
        pruneRecent(recentTelemetry, packetAt)
    }

    private fun appendLiveTelemetry(
        parsed: RefloatTelemetry,
        eventMap: MutableMap<String, Any?>,
    ): Map<String, Any?> {
        val session = boardConfig
        if (session == null) {
            appendRecentTelemetry(eventMap, parsed.lastPacketAt)
            return eventMap
        }

        val bucketPoint = FullTelemetryState.from(parsed.toCapture(session, canId)).toBucketPoint()
        liveTelemetryPoints.addLast(LiveTelemetryPoint(bucketPoint, eventMap))
        pruneLiveTelemetryPoints(parsed.lastPacketAt)
        val updates = sanitizeLiveTelemetryPoints()
        appendRecentTelemetry(eventMap, parsed.lastPacketAt)
        return if (updates.isNotEmpty()) eventMap + mapOf("metricExclusionUpdates" to updates) else eventMap
    }

    private fun pruneLiveTelemetryPoints(nowMs: Long) {
        val oldest = nowMs - recentWindowMs()
        while (liveTelemetryPoints.isNotEmpty() && liveTelemetryPoints.first().bucketPoint.capturedAtMs < oldest) {
            liveTelemetryPoints.removeFirst()
        }
    }

    private fun sanitizeLiveTelemetryPoints(): List<Map<String, Any?>> {
        if (liveTelemetryPoints.isEmpty()) return emptyList()
        val points = liveTelemetryPoints.map { it.bucketPoint }
        val sanitization = sanitizeTelemetrySamples(points)
        val updates = mutableListOf<Map<String, Any?>>()
        val lastIndex = liveTelemetryPoints.size - 1
        liveTelemetryPoints.forEachIndexed { index, point ->
            val exclusions = sanitization.samples[index].toLiveMetricExclusions()
            val previous = point.eventMap["metricExclusions"] as? Map<*, *>
            point.eventMap["metricExclusions"] = exclusions
            if (index != lastIndex && previous != exclusions) updates.add(
                mapOf(
                    "lastPacketAt" to point.bucketPoint.capturedAtMs,
                    "metricExclusions" to exclusions,
                ),
            )
        }
        return updates
    }

    private fun SanitizedSample.toLiveMetricExclusions(): Map<String, Boolean> =
        buildMap {
            if (excludedFromMaxSpeed) put(METRIC_MAX_SPEED, true)
            if (excludedFromMaxDuty) put(METRIC_MAX_DUTY, true)
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
        pruneLiveTelemetryPoints(System.currentTimeMillis())
        pruneRecent(recentLocations, System.currentTimeMillis())
    }

    private fun refreshLiveHistoryLimit() {
        val settings = kotlinx.coroutines.runBlocking {
            AppDataRepository.get(applicationContext).getTypedSettings()
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

    private fun armConnectPhaseTimeout(start: PendingStart, phase: String, timeoutMs: Long) {
        cancelConnectTimeout()
        val startedAt = System.currentTimeMillis()
        connectTimeout = Runnable {
            if (pendingConnect == start) {
                val elapsedMs = System.currentTimeMillis() - startedAt
                Log.w(
                    VESC_SESSION_TAG,
                    "connect phase timeout phase=$phase device=${start.boardConfig.deviceId} attempt=$connectAttempt elapsedMs=$elapsedMs status=$boardStatus canId=$canId",
                )
                recordLocalDiagnostic(
                    "connect_phase_timeout",
                    start.boardConfig,
                    "connect",
                    mapOf(
                        "message" to "BLE connect phase timed out",
                        "connect_phase" to phase,
                        "elapsed_ms" to elapsedMs,
                        "timeout_ms" to timeoutMs,
                    ),
                )
                failStart(start, "CONNECT_TIMEOUT", "Timed out connecting to board")
            }
        }
        mainHandler.postDelayed(connectTimeout!!, timeoutMs)
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

    private fun captureTelemetryParseFailed(payload: ByteArray) {
        telemetryParseFailedCount += 1
        if (telemetryParseFailedReported) return
        telemetryParseFailedReported = true
        captureDiagnostic(
            "telemetry_parse_failed",
            diagnosticProperties(boardConfig, "telemetry") + DiagnosticReporter.telemetryPayloadProperties(payload) + mapOf(
                "message" to "Invalid Refloat telemetry payload",
                "telemetry_parse_failed_count" to telemetryParseFailedCount,
            ),
        )
    }

    private fun flushTelemetryDiagnostics(reason: String) {
        if (telemetryParseFailedCount <= 0) return
        captureDiagnostic(
            "telemetry_parse_failed",
            diagnosticProperties(boardConfig, "telemetry") + mapOf(
                "message" to "Telemetry parse failures aggregated",
                "reason" to reason,
                "telemetry_parse_failed_count" to telemetryParseFailedCount,
            ),
        )
        telemetryParseFailedReported = false
        telemetryParseFailedCount = 0
    }

    private fun captureDiagnostic(eventName: String, properties: Map<String, Any?>) {
        TelemetryRepository.get(applicationContext).recordDiagnosticEvent(eventName, properties)
        DiagnosticReporter.get(this).capture(eventName, properties)
    }

    private fun recordLocalDiagnostic(
        eventName: String,
        session: SessionConfig?,
        operation: String,
        properties: Map<String, Any?> = emptyMap(),
    ) {
        TelemetryRepository.get(applicationContext).recordDiagnosticEvent(
            eventName,
            diagnosticProperties(session, operation) + properties,
        )
    }

    private fun recordConnectionLostMarker(session: SessionConfig, reason: String) {
        val store = telemetryStore ?: return
        val markerAt = lastTelemetryAt.takeIf { it > 0L } ?: return
        if (connectionLostMarkerAt == markerAt) return
        connectionLostMarkerAt = markerAt
        store.recordMarker(
            type = "connection_lost",
            deviceId = session.deviceId,
            deviceName = session.deviceName,
            message = reason,
            occurredAtMs = markerAt,
        )
    }

    private fun diagnosticProperties(session: SessionConfig?, operation: String): Map<String, Any?> =
        mapOf(
            "board_id" to session?.appBoardId,
            "ble_id" to session?.deviceId,
            "board_nickname" to session?.deviceName,
            "operation" to operation,
            "phase" to boardStatus.wireValue,
            "previous_board_phase" to boardStatus.wireValue,
            "current_board_phase" to boardStatus.wireValue,
            "connection_seq" to generation,
            "connect_attempt" to connectAttempt,
            "auto_reconnect_attempt" to autoReconnectAttempt,
            "auto_reconnect_enabled" to session?.autoReconnect,
            "can_id" to canId,
            "last_sent_command" to lastSentCommand,
            "last_received_command_byte" to lastReceivedCommandByte,
            "last_telemetry_timestamp" to lastTelemetryAt.takeIf { it > 0L },
        )
}
