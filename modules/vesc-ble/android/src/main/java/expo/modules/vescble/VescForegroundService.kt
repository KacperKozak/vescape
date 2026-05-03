package expo.modules.vescble

import android.annotation.SuppressLint
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Environment
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.vescble.telemetry.TelemetryCapture
import expo.modules.vescble.telemetry.TelemetryLocationCapture
import expo.modules.vescble.telemetry.TelemetryRepository
import org.json.JSONObject
import java.io.File
import java.io.FileWriter
import java.io.OutputStreamWriter
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToInt

private const val TAG = "VescSession"
private const val CHANNEL_ID = "vesc_monitoring_v4"
private const val NOTIFICATION_ID = 1001
private const val ACTION_START_SESSION = "expo.modules.vescble.ACTION_START_SESSION"
private const val ACTION_STOP_SESSION = "expo.modules.vescble.ACTION_STOP_SESSION"
private const val ACTION_EXIT_FROM_NOTIFICATION = "expo.modules.vescble.ACTION_EXIT_FROM_NOTIFICATION"
private const val ACTION_START_GPS_MONITORING = "expo.modules.vescble.ACTION_START_GPS_MONITORING"
private const val ACTION_STOP_GPS_MONITORING = "expo.modules.vescble.ACTION_STOP_GPS_MONITORING"

private const val COMM_FW_VERSION = 0
private const val COMM_FORWARD_CAN = 34
private const val COMM_CUSTOM_APP_DATA = 36
private const val COMM_PING_CAN = 62
private const val REFLOAT_MAGIC = 101
private const val REFLOAT_GET_ALLDATA = 10
private const val REFLOAT_FAULT_MODE = 69
private const val MAX_RECORDING_ACCURACY_M = 20.0

private val NUS_SERVICE_UUID = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e")
private val NUS_TX_UUID = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e")
private val NUS_RX_UUID = UUID.fromString("6e400003-b5a3-f393-e0a9-e50e24dcca9e")
private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

data class SessionConfig(
    val mode: String,
    val deviceId: String?,
    val deviceName: String,
    val canId: Int?,
    val pollIntervalMs: Long,
    val recordingEnabled: Boolean,
    val telemetryRecordingEnabled: Boolean,
    val recordingPath: String?,
    val autoReconnect: Boolean = false,
)

private data class RefloatTelemetry(
    val hasFault: Boolean,
    val faultCode: Int,
    val pitch: Double,
    val roll: Double,
    val balancePitch: Double,
    val balanceCurrent: Double,
    val speed: Double,
    val batteryVoltage: Double,
    val motorCurrent: Double,
    val batteryCurrent: Double,
    val erpm: Int,
    val dutyCycle: Double,
    val state: Int,
    val switchState: Int,
    val adc1: Double,
    val adc2: Double,
    val odometer: Double?,
    val tempMosfet: Double?,
    val tempMotor: Double?,
    val avgLatency: Int?,
    val lastPacketAt: Long,
    val location: LocationSnapshot?,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "hasFault" to hasFault,
        "faultCode" to faultCode,
        "pitch" to pitch,
        "roll" to roll,
        "balancePitch" to balancePitch,
        "balanceCurrent" to balanceCurrent,
        "speed" to speed,
        "batteryVoltage" to batteryVoltage,
        "motorCurrent" to motorCurrent,
        "batteryCurrent" to batteryCurrent,
        "erpm" to erpm,
        "dutyCycle" to dutyCycle,
        "state" to state,
        "stateName" to stateName(state),
        "switchState" to switchState,
        "adc1" to adc1,
        "adc2" to adc2,
        "odometer" to odometer,
        "tempMosfet" to tempMosfet,
        "tempMotor" to tempMotor,
        "avgLatency" to avgLatency,
        "lastPacketAt" to lastPacketAt,
        "location" to location?.toMap(),
    )
}

private data class LocationSnapshot(
    val latitude: Double,
    val longitude: Double,
    val speedMps: Double?,
    val bearingDeg: Double?,
    val accuracyM: Double?,
    val altitudeM: Double?,
    val timestamp: Long,
    val precise: Boolean,
    val saved: Boolean,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "latitude" to latitude,
        "longitude" to longitude,
        "speedMps" to speedMps,
        "bearingDeg" to bearingDeg,
        "accuracyM" to accuracyM,
        "altitudeM" to altitudeM,
        "timestamp" to timestamp,
        "precise" to precise,
        "saved" to saved,
    )
}

@SuppressLint("MissingPermission")
class VescForegroundService : Service() {
    companion object {
        var emitEvent: ((String, Map<String, Any?>) -> Unit)? = null

        private var instance: VescForegroundService? = null
        private var pendingStart: PendingStart? = null
        private var pendingStop: PendingStop? = null
        private var pendingGpsStart: PendingGpsStart? = null
        private var requestedGpsMonitoring: PendingGpsStart? = null
        private var requestedTelemetryRecordingEnabled = false

        fun startSession(
            context: Context,
            config: SessionConfig,
            onSuccess: () -> Unit,
            onError: (String, String) -> Unit,
        ) {
            pendingStart = PendingStart(config, onSuccess, onError)
            val intent = Intent(context, VescForegroundService::class.java).apply {
                action = ACTION_START_SESSION
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            instance?.consumePendingStart()
        }

        fun stopSession(context: Context, onSuccess: () -> Unit = {}) {
            pendingStop = PendingStop(onSuccess)
            val intent = Intent(context, VescForegroundService::class.java).apply {
                action = ACTION_STOP_SESSION
            }
            context.startService(intent)
            instance?.consumePendingStop()
        }

        fun startGpsMonitoring(
            context: Context,
            deviceId: String?,
            deviceName: String?,
        ) {
            val start = PendingGpsStart(deviceId, deviceName)
            requestedGpsMonitoring = start
            pendingGpsStart = start
            val intent = Intent(context, VescForegroundService::class.java).apply {
                action = ACTION_START_GPS_MONITORING
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            instance?.consumePendingGpsStart()
        }

        fun stopGpsMonitoring(context: Context) {
            requestedGpsMonitoring = null
            pendingGpsStart = null
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

        fun currentState(): Map<String, Any?> = instance?.sessionStateMap() ?: idleState()

        fun listRecordings(context: Context): List<Map<String, Any?>> {
            return VescRecordingStore(context).list()
        }

        fun deleteRecording(path: String): Boolean {
            return File(path).delete()
        }

        fun exportRecording(context: Context, path: String): String {
            return VescRecordingStore(context).export(path)
        }

        private fun idleState(): Map<String, Any?> = mapOf(
            "status" to "idle",
            "mode" to null,
            "deviceId" to null,
            "deviceName" to null,
            "canId" to null,
            "telemetry" to null,
            "location" to null,
            "error" to null,
            "autoReconnect" to false,
        )
    }

    private data class PendingStart(
        val config: SessionConfig,
        val onSuccess: () -> Unit,
        val onError: (String, String) -> Unit,
    )

    private data class PendingStop(val onSuccess: () -> Unit)
    private data class PendingGpsStart(val deviceId: String?, val deviceName: String?)

    private val mainHandler = Handler(Looper.getMainLooper())
    private val packetReassembler = VescPacketReassembler()
    private val rttHistory = ArrayDeque<Long>()

    private var config: SessionConfig? = null
    private var status: String = "idle"
    private var error: String? = null
    private var telemetry: RefloatTelemetry? = null
    private var canId: Int? = null
    private var gatt: BluetoothGatt? = null
    private var txChar: BluetoothGattCharacteristic? = null
    private var pendingCccdWrites = 0
    private var cccdTimeout: Runnable? = null
    private var connectTimeout: Runnable? = null
    private var pendingConnect: PendingStart? = null
    private var pollRunnable: Runnable? = null
    private var replayStartRunnable: Runnable? = null
    private var replayRunnable: Runnable? = null
    private val replayEventRunnables = mutableListOf<Runnable>()
    private var lastPollAt = 0L
    private var diagWriteCount = 0
    private var intentionalDisconnect = false
    private var connectAttempt = 0
    private var recorder: VescSessionRecorder? = null
    private var telemetryStore: TelemetryRepository? = null
    private var locationManager: LocationManager? = null
    private var latestLocation: LocationSnapshot? = null
    private var isStoppingService = false
    private var autoReconnectRunnable: Runnable? = null
    private var autoReconnectAttempt = 0

    private val locationListener = LocationListener { location ->
        onLocationUpdated(location)
    }

    private val bluetoothAdapter: BluetoothAdapter
        get() = (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SESSION -> consumePendingStart()
            ACTION_STOP_SESSION -> consumePendingStop()
            ACTION_EXIT_FROM_NOTIFICATION -> exitFromNotification()
            ACTION_START_GPS_MONITORING -> consumePendingGpsStart()
            ACTION_STOP_GPS_MONITORING -> stopGpsMonitoring()
            else -> if (config == null) stopSelf()
        }
        return if (isStoppingService) START_NOT_STICKY else START_STICKY
    }

    override fun onDestroy() {
        if (!isStoppingService) {
            stopCurrentSession(emitDisconnected = false)
        }
        instance = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
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
        if (config?.mode == "gps") {
            stop.onSuccess()
            return
        }
        val resumeGps = requestedGpsMonitoring
        if (resumeGps != null && config?.mode != null) {
            stopCurrentSession(emitDisconnected = true, updateNotification = false)
            startGpsMonitoring(resumeGps.deviceId, resumeGps.deviceName)
            stop.onSuccess()
            return
        }
        if (config == null) {
            isStoppingService = true
            stop.onSuccess()
            stopSelf()
            return
        }
        isStoppingService = true
        stopCurrentSession(emitDisconnected = true)
        stop.onSuccess()
        stopSelf()
    }

    private fun consumePendingGpsStart() {
        val start = pendingGpsStart ?: return
        pendingGpsStart = null
        startGpsMonitoring(start.deviceId, start.deviceName)
    }

    private fun exitFromNotification() {
        isStoppingService = true
        stopCurrentSession(emitDisconnected = true)
        closeAppTask()
        stopSelf()
    }

    private fun startGpsMonitoring(deviceId: String?, deviceName: String?) {
        if (config?.mode == "gps") {
            updateGpsContext(deviceId, deviceName)
            showNotification(latestLocation?.let { formatGpsNotificationText(it) } ?: "Monitoring GPS")
            return
        }
        if (config?.mode != null && config?.mode != "gps") {
            updateGpsContext(deviceId, deviceName)
            return
        }

        isStoppingService = false
        stopCurrentSession(emitDisconnected = false, updateNotification = false)
        config = SessionConfig(
            mode = "gps",
            deviceId = deviceId,
            deviceName = deviceName?.takeIf { it.isNotBlank() } ?: "GPS Monitoring",
            canId = null,
            pollIntervalMs = 0L,
            recordingEnabled = false,
            telemetryRecordingEnabled = requestedTelemetryRecordingEnabled,
            recordingPath = null,
            autoReconnect = false,
        )
        canId = null
        telemetry = null
        error = null
        latestLocation = null
        if (requestedTelemetryRecordingEnabled) {
            telemetryStore = TelemetryRepository.get(applicationContext)
            telemetryStore?.recordMarker(
                "app_stop",
                config?.deviceId,
                config?.deviceName,
                "GPS recording started",
            )
        }
        startLocationUpdates()
        status = "connected"
        emitState()
        startForeground(NOTIFICATION_ID, buildNotification("Monitoring GPS"))
    }

    private fun stopGpsMonitoring() {
        if (config?.mode != "gps") return
        isStoppingService = true
        stopCurrentSession(emitDisconnected = false)
        stopSelf()
    }

    private fun updateGpsContext(deviceId: String?, deviceName: String?) {
        val session = config ?: return
        config = session.copy(
            deviceId = deviceId,
            deviceName = deviceName?.takeIf { it.isNotBlank() } ?: session.deviceName,
        )
    }

    private fun beginSession(start: PendingStart) {
        isStoppingService = false
        stopCurrentSession(emitDisconnected = false, updateNotification = false)
        config = start.config
        canId = start.config.canId
        error = null
        telemetry = null
        latestLocation = null
        packetReassembler.reset()
        diagWriteCount = 0
        connectAttempt = 0
        autoReconnectAttempt = 0
        if (start.config.recordingEnabled && start.config.mode != "replay") {
            recorder = VescSessionRecorder(this, start.config).also { it.start() }
        }
        telemetryStore = if (
            start.config.mode != "replay" &&
            (start.config.telemetryRecordingEnabled || requestedTelemetryRecordingEnabled)
        ) {
            TelemetryRepository.get(applicationContext)
        } else {
            null
        }
        startLocationUpdates()
        setStatus("connecting")
        startForeground(NOTIFICATION_ID, buildNotification("Connecting..."))

        when (start.config.mode) {
            "replay" -> startReplaySession(start)
            else -> startBleSession(start)
        }
    }

    private fun startReplaySession(start: PendingStart) {
        val path = start.config.recordingPath
        if (path.isNullOrBlank()) {
            failStart(start, "INVALID_RECORDING", "Replay session requires recordingPath")
            return
        }
        val events = try {
            VescRecordingStore(this).readReplayEvents(path)
        } catch (e: Exception) {
            failStart(start, "INVALID_RECORDING", e.message ?: "Could not read recording")
            return
        }
        showNotification("Opening recording...")
        replayStartRunnable = Runnable {
            status = "connected"
            emitState()
            showNotification("Replaying recording")
            start.onSuccess()
            startReplayLoop(events)
        }
        mainHandler.postDelayed(replayStartRunnable!!, 700)
    }

    private fun startBleSession(start: PendingStart) {
        val deviceId = start.config.deviceId
        if (deviceId.isNullOrBlank()) {
            failStart(start, "INVALID_DEVICE", "startSession requires deviceId in BLE mode")
            return
        }
        pendingConnect = start
        connectAttempt++
        cancelConnectTimeout()
        val device = bluetoothAdapter.getRemoteDevice(deviceId)
        gatt = device.connectGatt(this, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        connectTimeout = Runnable {
            if (pendingConnect == start) {
                failStart(start, "CONNECT_TIMEOUT", "Timed out connecting to board")
            }
        }
        mainHandler.postDelayed(connectTimeout!!, 12_000)
        Log.d(TAG, "connectGatt $deviceId attempt=$connectAttempt")
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            Log.d(TAG, "onConnectionStateChange status=$status newState=$newState")
            recorder?.recordState("gatt:$newState", mapOf("status" to status))
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> gatt.requestMtu(517)
                BluetoothProfile.STATE_DISCONNECTED -> {
                    val wasConnecting = pendingConnect
                    val wasIntentional = intentionalDisconnect
                    clearGatt(markIntentional = false)
                    cancelConnectTimeout()
                    stopPolling()
                    if (wasIntentional) {
                        intentionalDisconnect = false
                    } else if (wasConnecting != null) {
                        if (status == 133 && connectAttempt < 2) {
                            Log.w(TAG, "status=133 during connect, retrying once")
                            mainHandler.postDelayed({ startBleSession(wasConnecting) }, 250)
                        } else if (wasConnecting.config.autoReconnect) {
                            scheduleAutoReconnect(wasConnecting.config, status, "connect failed")
                        } else {
                            failStart(wasConnecting, "DISCONNECTED", "Device disconnected during connect (status=$status)")
                        }
                    } else if (config?.autoReconnect == true) {
                        scheduleAutoReconnect(config!!, status, "board disconnected")
                    } else {
                        setError("Board disconnected")
                        emitEvent("onDisconnected", mapOf("status" to status))
                        finishRecording("error")
                    }
                }
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            Log.d(TAG, "onMtuChanged mtu=$mtu status=$status")
            if (!gatt.discoverServices()) {
                failPendingConnect("DISCOVERY_FAILED", "Could not start service discovery")
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                failPendingConnect("DISCOVERY_FAILED", "Service discovery failed status=$status")
                return
            }
            val service = gatt.getService(NUS_SERVICE_UUID)
            val tx = service?.getCharacteristic(NUS_TX_UUID)
            val rx = service?.getCharacteristic(NUS_RX_UUID)
            if (service == null || tx == null || rx == null) {
                failPendingConnect("NO_CHAR", "NUS service/characteristics not found")
                return
            }
            txChar = tx
            gatt.setCharacteristicNotification(rx, true)
            gatt.setCharacteristicNotification(tx, true)

            val rxCccd = rx.getDescriptor(CCCD_UUID)
            if (rxCccd == null) {
                resolveBleConnect()
                return
            }
            pendingCccdWrites = 1
            if (tx.getDescriptor(CCCD_UUID) != null) pendingCccdWrites = 2
            writeCccd(gatt, rxCccd)

            cccdTimeout = Runnable {
                Log.w(TAG, "CCCD ack timeout, resolving connect")
                resolveBleConnect()
            }
            mainHandler.postDelayed(cccdTimeout!!, 4000)
        }

        override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            if (descriptor.uuid != CCCD_UUID) return
            pendingCccdWrites--
            if (pendingCccdWrites > 0) {
                val txCccd = gatt.getService(NUS_SERVICE_UUID)
                    ?.getCharacteristic(NUS_TX_UUID)
                    ?.getDescriptor(CCCD_UUID)
                if (txCccd != null) {
                    writeCccd(gatt, txCccd)
                    return
                }
            }
            resolveBleConnect()
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
        ) {
            if (characteristic.uuid == NUS_RX_UUID || characteristic.uuid == NUS_TX_UUID) {
                handleFrameChunk(value)
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            val value = characteristic.value ?: return
            if (characteristic.uuid == NUS_RX_UUID || characteristic.uuid == NUS_TX_UUID) {
                handleFrameChunk(value)
            }
        }
    }

    private fun resolveBleConnect() {
        cancelConnectTimeout()
        cancelCccdTimeout()
        val start = pendingConnect ?: return
        pendingConnect = null
        autoReconnectAttempt = 0
        status = "connected"
        error = null
        emitState()
        emitEvent("onConnected", mapOf("mtu" to 517))
        telemetryStore?.recordMarker("connected", config?.deviceId, config?.deviceName)
        showNotification("Discovering board...")
        start.onSuccess()
        mainHandler.postDelayed({ sendPayload(byteArrayOf(COMM_FW_VERSION.toByte())) }, 500)
        mainHandler.postDelayed({ sendPayload(byteArrayOf(COMM_PING_CAN.toByte())) }, 800)
        if (canId != null) startPolling()
    }

    private fun handleFrameChunk(chunk: ByteArray) {
        recorder?.recordChunk("rx", chunk)
        emitEvent("onNotification", mapOf("value" to Base64.encodeToString(chunk, Base64.NO_WRAP)))
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
                val parsed = parseGetAllData(payload) ?: return
                telemetry = parsed
                showNotification(formatNotificationText(parsed))
                emitEvent("onTelemetry", parsed.toMap())
                recordTelemetry(parsed)
                emitState()
            }
        }
    }

    private fun startPolling() {
        val session = config ?: return
        val id = canId ?: return
        stopPolling()
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
    }

    private fun startReplayLoop(events: List<RecordedReplayEvent>) {
        stopReplayLoop()
        if (events.isEmpty()) {
            setError("Recording has no RX events")
            return
        }
        fun scheduleLoop() {
            replayEventRunnables.clear()
            events.forEach { event ->
                val runnable = Runnable {
                    lastPollAt = System.currentTimeMillis() - 40
                    handleFrameChunk(event.bytes)
                }
                replayEventRunnables.add(runnable)
                mainHandler.postDelayed(runnable, event.t)
            }
            val loopDelay = events.last().t + 1000L
            replayRunnable = Runnable {
                packetReassembler.reset()
                scheduleLoop()
            }
            mainHandler.postDelayed(replayRunnable!!, loopDelay)
        }
        scheduleLoop()
    }

    private fun stopReplayLoop() {
        replayStartRunnable?.let { mainHandler.removeCallbacks(it) }
        replayStartRunnable = null
        replayRunnable?.let { mainHandler.removeCallbacks(it) }
        replayRunnable = null
        replayEventRunnables.forEach { mainHandler.removeCallbacks(it) }
        replayEventRunnables.clear()
    }

    private fun sendPayload(payload: ByteArray): Boolean {
        val framed = VescPacketCodec.encode(payload)
        return sendFramedChunk(framed)
    }

    private fun sendFramedChunk(bytes: ByteArray): Boolean {
        val g = gatt ?: return false
        val tx = txChar ?: return false
        val writeType = if (diagWriteCount < 3) {
            diagWriteCount++
            BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        } else {
            BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        }
        val ok = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            g.writeCharacteristic(tx, bytes, writeType) == BluetoothStatusCodes.SUCCESS
        } else {
            @Suppress("DEPRECATION")
            tx.value = bytes
            @Suppress("DEPRECATION")
            tx.writeType = writeType
            @Suppress("DEPRECATION")
            g.writeCharacteristic(tx)
        }
        if (ok) recorder?.recordChunk("tx", bytes)
        return ok
    }

    private fun parseGetAllData(payload: ByteArray): RefloatTelemetry? {
        if (payload.size < 5) return null
        if ((payload[0].toInt() and 0xff) != COMM_CUSTOM_APP_DATA) return null
        if ((payload[1].toInt() and 0xff) != REFLOAT_MAGIC) return null
        if ((payload[2].toInt() and 0xff) != REFLOAT_GET_ALLDATA) return null

        val now = System.currentTimeMillis()
        val avgLatency = updateLatency(now)
        val mode = payload[3].toInt() and 0xff
        if (mode == REFLOAT_FAULT_MODE) {
            return RefloatTelemetry(
                hasFault = true,
                faultCode = payload.getOrNull(4)?.toInt()?.and(0xff) ?: 0,
                pitch = 0.0,
                roll = 0.0,
                balancePitch = 0.0,
                balanceCurrent = 0.0,
                speed = 0.0,
                batteryVoltage = 0.0,
                motorCurrent = 0.0,
                batteryCurrent = 0.0,
                erpm = 0,
                dutyCycle = 0.0,
                state = 0,
                switchState = 0,
                adc1 = 0.0,
                adc2 = 0.0,
                odometer = null,
                tempMosfet = null,
                tempMotor = null,
                avgLatency = avgLatency,
                lastPacketAt = now,
                location = latestLocation,
            )
        }
        if (payload.size < 34) return null

        val pitch = int16(payload, 20) / 10.0
        val speed = (int16(payload, 27) / 10.0) * 3.6
        val state = payload[10].toInt() and 0xff
        val odometer = if (mode >= 2 && payload.size >= 42) float32Auto(payload, 35) else null
        return RefloatTelemetry(
            hasFault = false,
            faultCode = 0,
            pitch = pitch,
            roll = int16(payload, 8) / 10.0,
            balancePitch = int16(payload, 6) / 10.0,
            balanceCurrent = int16(payload, 4) / 10.0,
            speed = speed,
            batteryVoltage = int16(payload, 23) / 10.0,
            motorCurrent = int16(payload, 29) / 10.0,
            batteryCurrent = int16(payload, 31) / 10.0,
            erpm = int16(payload, 25),
            dutyCycle = ((payload[33].toInt() and 0xff) - 128) / 100.0,
            state = state,
            switchState = payload[11].toInt() and 0xff,
            adc1 = (payload[12].toInt() and 0xff) / 50.0,
            adc2 = (payload[13].toInt() and 0xff) / 50.0,
            odometer = odometer,
            tempMosfet = if (mode >= 2 && payload.size >= 42) (payload[39].toInt() and 0xff) / 2.0 else null,
            tempMotor = if (mode >= 2 && payload.size >= 42) (payload[40].toInt() and 0xff) / 2.0 else null,
            avgLatency = avgLatency,
            lastPacketAt = now,
            location = latestLocation,
        )
    }

    private fun updateLatency(now: Long): Int? {
        if (lastPollAt <= 0) return null
        rttHistory.addLast(max(0, now - lastPollAt))
        while (rttHistory.size > 5) rttHistory.removeFirst()
        return rttHistory.average().roundToInt()
    }

    private fun stopCurrentSession(emitDisconnected: Boolean, updateNotification: Boolean = true) {
        val stoppedConfig = config
        stopLocationUpdates()
        autoReconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        autoReconnectRunnable = null
        cancelCccdTimeout()
        cancelConnectTimeout()
        stopPolling()
        stopReplayLoop()
        clearGatt(markIntentional = true)
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
        latestLocation = null
        error = null
        status = "idle"
        config = null
        if (updateNotification && !isStoppingService && stoppedConfig != null) showNotification()
        emitState()
        if (emitDisconnected) emitEvent("onDisconnected", mapOf("status" to 0))
    }

    private fun clearGatt(markIntentional: Boolean = true) {
        try {
            if (markIntentional && gatt != null) intentionalDisconnect = true
            gatt?.disconnect()
            gatt?.close()
        } catch (e: Exception) {
            Log.w(TAG, "GATT cleanup failed: ${e.message}")
        }
        gatt = null
        txChar = null
    }

    private fun finishRecording(status: String) {
        recorder?.finish(status = status)
        recorder = null
    }

    private fun failPendingConnect(code: String, message: String) {
        pendingConnect?.let { failStart(it, code, message) }
    }

    private fun failStart(start: PendingStart, code: String, message: String) {
        if (start.config.autoReconnect) {
            scheduleAutoReconnect(start.config, null, message)
            start.onError(code, message)
            return
        }
        pendingConnect = null
        cancelConnectTimeout()
        cancelCccdTimeout()
        stopPolling()
        clearGatt(markIntentional = true)
        setError(message)
        showNotification(message)
        finishRecording("error")
        telemetryStore?.flushBlocking()
        telemetryStore = null
        start.onError(code, message)
    }

    private fun setStatus(next: String) {
        status = next
        recorder?.recordState(next)
        emitState()
    }

    private fun scheduleAutoReconnect(session: SessionConfig, gattStatus: Int?, reason: String) {
        if (!session.autoReconnect || isStoppingService) return
        pendingConnect = null
        cancelConnectTimeout()
        cancelCccdTimeout()
        stopPolling()
        clearGatt(markIntentional = false)
        status = "reconnecting"
        error = reason
        autoReconnectAttempt += 1
        recorder?.recordState(
            "reconnecting",
            mapOf("attempt" to autoReconnectAttempt, "status" to gattStatus),
        )
        emitEvent("onDisconnected", mapOf("status" to (gattStatus ?: -1)))
        emitState()
        showNotification("Reconnecting...")

        autoReconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        val delayMs = minOf(250L * autoReconnectAttempt, 2_000L)
        val retry = Runnable {
            autoReconnectRunnable = null
            if (config?.autoReconnect == true && status == "reconnecting") {
                connectAttempt = 0
                startBleSession(PendingStart(session, onSuccess = {}, onError = { _, _ -> }))
            }
        }
        autoReconnectRunnable = retry
        mainHandler.postDelayed(retry, delayMs)
    }

    private fun setError(message: String) {
        status = "error"
        error = message
        recorder?.recordState("error", mapOf("message" to message))
        telemetryStore?.recordMarker("error", config?.deviceId, config?.deviceName, message)
        emitEvent("onError", mapOf("message" to message))
        emitState()
    }

    private fun emitState() {
        emitEvent("onSessionState", sessionStateMap())
    }

    private fun emitEvent(name: String, body: Map<String, Any?>) {
        emitEvent?.invoke(name, body)
    }

    private fun startLocationUpdates() {
        if (config?.mode == "replay") return
        val hasFine = ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (!hasFine) return
        val lm = (getSystemService(Context.LOCATION_SERVICE) as? LocationManager) ?: return
        locationManager = lm
        try {
            lm.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                1000L,
                0f,
                locationListener,
                Looper.getMainLooper(),
            )
            lm.requestLocationUpdates(
                LocationManager.NETWORK_PROVIDER,
                2000L,
                0f,
                locationListener,
                Looper.getMainLooper(),
            )
        } catch (e: Exception) {
            Log.w(TAG, "Location updates failed: ${e.message}")
        }
    }

    private fun stopLocationUpdates() {
        val lm = locationManager ?: return
        try {
            lm.removeUpdates(locationListener)
        } catch (_: Exception) {
        }
        locationManager = null
    }

    private fun setTelemetryRecordingEnabled(enabled: Boolean) {
        val session = config
        if (enabled && session?.mode != "replay") {
            if (telemetryStore == null) {
                telemetryStore = TelemetryRepository.get(applicationContext)
                telemetryStore?.recordMarker(
                    if (status == "connected") "connected" else "app_stop",
                    session?.deviceId,
                    session?.deviceName,
                    if (status == "connected") null else "Recording started",
                )
            }
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
    }

    private fun onLocationUpdated(location: Location) {
        val precise = location.hasAccuracy() && location.accuracy.toDouble() <= MAX_RECORDING_ACCURACY_M
        val saved = telemetryStore?.recordLocation(
            TelemetryLocationCapture(
                latitude = location.latitude,
                longitude = location.longitude,
                speedMps = if (location.hasSpeed()) location.speed.toDouble() else null,
                bearingDeg = if (location.hasBearing()) location.bearing.toDouble() else null,
                accuracyM = if (location.hasAccuracy()) location.accuracy.toDouble() else null,
                altitudeM = if (location.hasAltitude()) location.altitude else null,
                timestamp = location.time,
                precise = precise,
            ),
            deviceId = config?.deviceId,
            deviceName = config?.deviceName,
        ) ?: false
        val snapshot = LocationSnapshot(
            latitude = location.latitude,
            longitude = location.longitude,
            speedMps = if (location.hasSpeed()) location.speed.toDouble() else null,
            bearingDeg = if (location.hasBearing()) location.bearing.toDouble() else null,
            accuracyM = if (location.hasAccuracy()) location.accuracy.toDouble() else null,
            altitudeM = if (location.hasAltitude()) location.altitude else null,
            timestamp = location.time,
            precise = precise,
            saved = saved,
        )
        latestLocation = snapshot
        emitEvent("onLocation", snapshot.toMap())
        if (config?.mode == "gps") showNotification(formatGpsNotificationText(snapshot))
        if (snapshot.precise) recorder?.recordLocation(snapshot)
    }

    private fun sessionStateMap(): Map<String, Any?> = mapOf(
        "status" to status,
        "mode" to config?.mode,
        "deviceId" to config?.deviceId,
        "deviceName" to config?.deviceName,
        "canId" to canId,
        "telemetry" to telemetry?.toMap(),
        "location" to latestLocation?.toMap(),
        "error" to error,
        "autoReconnect" to (config?.autoReconnect ?: false),
    )

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "VESC Board Monitoring",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Shows while monitoring board and GPS data"
                setSound(null, null)
                enableVibration(false)
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun showNotification(text: String = "Monitoring board in background") {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun buildNotification(text: String = "Monitoring board in background"): Notification {
        return androidx.core.app.NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(config?.deviceName ?: "VESC")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(buildOpenAppIntent())
            .setOngoing(true)
            .setCategory(androidx.core.app.NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(androidx.core.app.NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(
                androidx.core.app.NotificationCompat.FOREGROUND_SERVICE_DEFERRED,
            )
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_LOW)
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

    private fun buildStopIntent(): PendingIntent {
        val intent = Intent(this, VescForegroundService::class.java).apply {
            action = ACTION_EXIT_FROM_NOTIFICATION
        }
        return PendingIntent.getService(
            this,
            1,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    private fun buildOpenAppIntent(): PendingIntent {
        val intent = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
        return PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    private fun closeAppTask() {
        try {
            getSystemService(ActivityManager::class.java)
                ?.appTasks
                ?.forEach { it.finishAndRemoveTask() }
        } catch (e: Exception) {
            Log.w(TAG, "App task cleanup failed: ${e.message}")
        }
    }

    private fun writeCccd(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
        } else {
            @Suppress("DEPRECATION")
            descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            @Suppress("DEPRECATION")
            gatt.writeDescriptor(descriptor)
        }
    }

    private fun cancelCccdTimeout() {
        cccdTimeout?.let { mainHandler.removeCallbacks(it) }
        cccdTimeout = null
    }

    private fun cancelConnectTimeout() {
        connectTimeout?.let { mainHandler.removeCallbacks(it) }
        connectTimeout = null
    }

    private fun formatNotificationText(values: RefloatTelemetry): String {
        if (values.hasFault) return "Fault ${values.faultCode}"
        return String.format(
            "%.1f km/h | %.0f%% duty | %.1fV",
            abs(values.speed),
            values.dutyCycle * 100.0,
            values.batteryVoltage,
        )
    }

    private fun formatGpsNotificationText(location: LocationSnapshot): String {
        val speedKmh = (location.speedMps ?: 0.0) * 3.6
        return String.format("GPS %.1f km/h", abs(speedKmh))
    }

    private fun recordTelemetry(values: RefloatTelemetry) {
        val session = config ?: return
        if (session.mode == "replay") return
        telemetryStore?.recordTelemetry(
            TelemetryCapture(
                capturedAtMs = values.lastPacketAt,
                elapsedRealtimeMs = SystemClock.elapsedRealtime(),
                deviceId = session.deviceId,
                deviceName = session.deviceName,
                canId = canId,
                hasFault = values.hasFault,
                faultCode = values.faultCode,
                pitch = values.pitch,
                roll = values.roll,
                balancePitch = values.balancePitch,
                balanceCurrent = values.balanceCurrent,
                speed = values.speed,
                batteryVoltage = values.batteryVoltage,
                motorCurrent = values.motorCurrent,
                batteryCurrent = values.batteryCurrent,
                erpm = values.erpm,
                dutyCycle = values.dutyCycle,
                state = values.state,
                switchState = values.switchState,
                adc1 = values.adc1,
                adc2 = values.adc2,
                odometer = values.odometer,
                tempMosfet = values.tempMosfet,
                tempMotor = values.tempMotor,
                avgLatency = values.avgLatency,
                location = values.location?.let {
                    TelemetryLocationCapture(
                        latitude = it.latitude,
                        longitude = it.longitude,
                        speedMps = it.speedMps,
                        bearingDeg = it.bearingDeg,
                        accuracyM = it.accuracyM,
                        altitudeM = it.altitudeM,
                        timestamp = it.timestamp,
                        precise = it.precise,
                    )
                },
            )
        )
    }
}

private object VescPacketCodec {
    fun encode(payload: ByteArray): ByteArray {
        val short = payload.size <= 255
        val frame = ByteArray((if (short) 2 else 3) + payload.size + 3)
        var offset = 0
        if (short) {
            frame[offset++] = 0x02
            frame[offset++] = payload.size.toByte()
        } else {
            frame[offset++] = 0x03
            frame[offset++] = ((payload.size shr 8) and 0xff).toByte()
            frame[offset++] = (payload.size and 0xff).toByte()
        }
        payload.copyInto(frame, offset)
        offset += payload.size
        val crc = crc16(payload)
        frame[offset++] = ((crc shr 8) and 0xff).toByte()
        frame[offset++] = (crc and 0xff).toByte()
        frame[offset] = 0x03
        return frame
    }
}

private class VescPacketReassembler {
    private val buffer = ArrayList<Byte>()

    fun reset() {
        buffer.clear()
    }

    fun feed(chunk: ByteArray): List<ByteArray> {
        chunk.forEach { buffer.add(it) }
        val packets = mutableListOf<ByteArray>()
        while (buffer.isNotEmpty()) {
            val start = buffer[0].toInt() and 0xff
            if (start != 0x02 && start != 0x03) {
                buffer.removeAt(0)
                continue
            }
            val headerLen = if (start == 0x02) 2 else 3
            if (buffer.size < headerLen) break
            val len = if (start == 0x02) {
                buffer[1].toInt() and 0xff
            } else {
                ((buffer[1].toInt() and 0xff) shl 8) or (buffer[2].toInt() and 0xff)
            }
            val total = headerLen + len + 3
            if (buffer.size < total) break
            if ((buffer[total - 1].toInt() and 0xff) != 0x03) {
                buffer.removeAt(0)
                continue
            }
            val payload = ByteArray(len)
            for (i in 0 until len) payload[i] = buffer[headerLen + i]
            val actual = ((buffer[headerLen + len].toInt() and 0xff) shl 8) or
                (buffer[headerLen + len + 1].toInt() and 0xff)
            if (crc16(payload) == actual) {
                packets.add(payload)
                repeat(total) { buffer.removeAt(0) }
            } else {
                buffer.removeAt(0)
            }
        }
        return packets
    }
}

private data class RecordedReplayEvent(val t: Long, val bytes: ByteArray)

private class VescSessionRecorder(context: Context, private val config: SessionConfig) {
    private val store = VescRecordingStore(context)
    private val startedAt = System.currentTimeMillis()
    private val writer: FileWriter
    val file: File

    init {
        file = store.createFile(config.deviceName)
        writer = FileWriter(file, false)
    }

    fun start() {
        write(
            JSONObject()
                .put("t", 0)
                .put("kind", "meta")
                .put("version", 1)
                .put("deviceName", config.deviceName)
                .put("deviceId", config.deviceId)
                .put("mode", config.mode)
                .put("pollIntervalMs", config.pollIntervalMs)
                .put("startedAt", startedAt)
        )
        recordState("recording-started")
    }

    fun recordState(status: String, extra: Map<String, Any?> = emptyMap()) {
        val json = JSONObject()
            .put("t", elapsed())
            .put("kind", "session-state")
            .put("status", status)
        extra.forEach { (key, value) -> json.put(key, value) }
        write(json)
    }

    fun recordChunk(direction: String, bytes: ByteArray) {
        write(
            JSONObject()
                .put("t", elapsed())
                .put("kind", "ble-chunk")
                .put("direction", direction)
                .put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
        )
    }

    fun recordLocation(location: LocationSnapshot) {
        write(
            JSONObject()
                .put("t", elapsed())
                .put("kind", "location")
                .put("latitude", location.latitude)
                .put("longitude", location.longitude)
                .put("speedMps", location.speedMps)
                .put("bearingDeg", location.bearingDeg)
                .put("accuracyM", location.accuracyM)
                .put("altitudeM", location.altitudeM)
                .put("timestamp", location.timestamp)
        )
    }

    fun finish(status: String) {
        try {
            recordState(status)
            writer.flush()
            writer.close()
        } catch (e: Exception) {
            Log.w(TAG, "Recording close failed: ${e.message}")
        }
    }

    private fun elapsed(): Long = System.currentTimeMillis() - startedAt

    private fun write(json: JSONObject) {
        try {
            writer.append(json.toString()).append('\n')
            writer.flush()
        } catch (e: Exception) {
            Log.w(TAG, "Recording write failed: ${e.message}")
        }
    }
}

private class VescRecordingStore(private val context: Context) {
    private val dir: File
        get() = File(context.filesDir, "vesc-recordings").also { it.mkdirs() }

    fun createFile(deviceName: String): File {
        val safeName = deviceName.replace(Regex("[^A-Za-z0-9._-]+"), "-").trim('-').ifBlank { "vesc-board" }
        return File(dir, "${System.currentTimeMillis()}-$safeName.jsonl")
    }

    fun list(): List<Map<String, Any?>> {
        return dir.listFiles { file -> file.isFile && file.extension == "jsonl" }
            ?.sortedByDescending { it.lastModified() }
            ?.map { file ->
                val meta = readMeta(file)
                mapOf(
                    "id" to file.absolutePath,
                    "path" to file.absolutePath,
                    "fileName" to file.name,
                    "deviceName" to (meta?.optString("deviceName")?.takeIf { it.isNotBlank() } ?: "Recorded Session"),
                    "startedAt" to (meta?.optLong("startedAt", file.lastModified()) ?: file.lastModified()),
                    "sizeBytes" to file.length(),
                )
            }
            ?: emptyList()
    }

    fun readReplayEvents(path: String): List<RecordedReplayEvent> {
        val file = File(path)
        if (!file.exists()) throw IllegalArgumentException("Recording not found")
        val events = mutableListOf<RecordedReplayEvent>()
        file.forEachLine { line ->
            if (line.isBlank()) return@forEachLine
            val json = JSONObject(line)
            if (json.optString("kind") == "ble-chunk" && json.optString("direction") == "rx") {
                events.add(
                    RecordedReplayEvent(
                        t = json.optLong("t", 0L),
                        bytes = Base64.decode(json.getString("base64"), Base64.NO_WRAP),
                    )
                )
            }
        }
        val first = events.firstOrNull()?.t ?: 0L
        return events.map { it.copy(t = (it.t - first).coerceAtLeast(0L)) }
    }

    fun export(path: String): String {
        val source = File(path)
        if (!source.exists()) throw IllegalArgumentException("Recording not found")
        val outputName = source.name
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, outputName)
                put(MediaStore.Downloads.MIME_TYPE, "application/jsonl")
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("Could not create download")
            resolver.openOutputStream(uri)?.use { output ->
                source.inputStream().use { input -> input.copyTo(output) }
            }
            return uri.toString()
        }
        val destDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            ?: throw IllegalStateException("Downloads directory unavailable")
        destDir.mkdirs()
        val dest = File(destDir, outputName)
        source.copyTo(dest, overwrite = true)
        return dest.absolutePath
    }

    private fun readMeta(file: File): JSONObject? {
        return try {
            file.useLines { lines ->
                lines.firstOrNull { it.isNotBlank() }?.let { JSONObject(it) }
            }
        } catch (_: Exception) {
            null
        }
    }
}

private fun crc16(data: ByteArray): Int {
    var crc = 0
    for (b in data) {
        crc = crc xor ((b.toInt() and 0xff) shl 8)
        repeat(8) {
            crc = if ((crc and 0x8000) != 0) {
                ((crc shl 1) xor 0x1021) and 0xffff
            } else {
                (crc shl 1) and 0xffff
            }
        }
    }
    return crc and 0xffff
}

private fun int16(bytes: ByteArray, offset: Int): Int {
    return ByteBuffer.wrap(bytes, offset, 2).order(ByteOrder.BIG_ENDIAN).short.toInt()
}

private fun float32Auto(bytes: ByteArray, offset: Int): Double {
    val raw = ByteBuffer.wrap(bytes, offset, 4).order(ByteOrder.BIG_ENDIAN).int
    val eRaw = (raw ushr 23) and 0xff
    val sigI = raw and 0x7fffff
    val neg = (raw ushr 31) != 0
    if (eRaw == 0 && sigI == 0) return 0.0
    val sig = sigI / (8388608.0 * 2.0) + 0.5
    val result = sig * 2.0.pow(eRaw - 126)
    return if (neg) -result else result
}

private fun stateName(state: Int): String {
    return when (state and 0x0f) {
        0 -> "STARTUP"
        1 -> "RUNNING"
        2 -> "TILTBACK"
        3 -> "WHEELSLIP"
        4 -> "UPSIDEDOWN"
        5 -> "FLYWHEEL"
        6 -> "FAULT_PITCH"
        7 -> "FAULT_ROLL"
        8 -> "FAULT_SW_HALF"
        9 -> "FAULT_SW_FULL"
        11 -> "FAULT_STARTUP"
        12 -> "FAULT_REVERSE"
        13 -> "FAULT_QUICKSTOP"
        14 -> "CHARGING"
        15 -> "DISABLED"
        else -> "UNKNOWN"
    }
}
