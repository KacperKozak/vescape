package expo.modules.vescble

import android.annotation.SuppressLint
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
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToInt

private const val TAG = "VescSession"
private const val CHANNEL_ID = "vesc_monitoring_v2"
private const val NOTIFICATION_ID = 1001
private const val ACTION_START_SESSION = "expo.modules.vescble.ACTION_START_SESSION"
private const val ACTION_STOP_SESSION = "expo.modules.vescble.ACTION_STOP_SESSION"
private const val ACTION_STOP_FROM_NOTIFICATION = "expo.modules.vescble.ACTION_STOP_MONITORING"

private const val COMM_FW_VERSION = 0
private const val COMM_FORWARD_CAN = 34
private const val COMM_CUSTOM_APP_DATA = 36
private const val COMM_PING_CAN = 62
private const val REFLOAT_MAGIC = 101
private const val REFLOAT_GET_ALLDATA = 10
private const val REFLOAT_FAULT_MODE = 69

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
    val scenario: String,
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
    )
}

@SuppressLint("MissingPermission")
class VescForegroundService : Service() {
    companion object {
        var emitEvent: ((String, Map<String, Any?>) -> Unit)? = null

        private var instance: VescForegroundService? = null
        private var pendingStart: PendingStart? = null
        private var pendingStop: PendingStop? = null

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

        fun send(base64: String): Boolean {
            val bytes = Base64.decode(base64, Base64.NO_WRAP)
            return instance?.sendFramedChunk(bytes) == true
        }

        fun currentState(): Map<String, Any?> = instance?.sessionStateMap() ?: idleState()

        fun updateNotification(text: String) {
            instance?.showNotification(text)
        }

        private fun idleState(): Map<String, Any?> = mapOf(
            "status" to "idle",
            "mode" to null,
            "deviceId" to null,
            "deviceName" to null,
            "canId" to null,
            "telemetry" to null,
            "error" to null,
        )
    }

    private data class PendingStart(
        val config: SessionConfig,
        val onSuccess: () -> Unit,
        val onError: (String, String) -> Unit,
    )

    private data class PendingStop(val onSuccess: () -> Unit)

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
    private var pendingConnect: PendingStart? = null
    private var pollRunnable: Runnable? = null
    private var demoRunnable: Runnable? = null
    private var lastPollAt = 0L
    private var diagWriteCount = 0
    private var demo = DemoBoard()
    private var intentionalDisconnect = false
    private var connectAttempt = 0

    private val bluetoothAdapter: BluetoothAdapter
        get() = (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    private val stopReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == ACTION_STOP_FROM_NOTIFICATION) {
                stopCurrentSession(emitDisconnected = true)
                stopSelf()
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        registerStopReceiver()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SESSION -> consumePendingStart()
            ACTION_STOP_SESSION -> consumePendingStop()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        stopCurrentSession(emitDisconnected = false)
        instance = null
        try {
            unregisterReceiver(stopReceiver)
        } catch (_: IllegalArgumentException) {
        }
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
        stopCurrentSession(emitDisconnected = true)
        stop.onSuccess()
        stopSelf()
    }

    private fun beginSession(start: PendingStart) {
        stopCurrentSession(emitDisconnected = false)
        config = start.config
        canId = start.config.canId
        error = null
        telemetry = null
        packetReassembler.reset()
        diagWriteCount = 0
        connectAttempt = 0
        setStatus("connecting")
        showNotification("Connecting...")

        if (start.config.mode == "demo") {
            startDemoSession(start)
        } else {
            startBleSession(start)
        }
    }

    private fun startDemoSession(start: PendingStart) {
        status = "connected"
        emitState()
        showNotification("Demo session running")
        start.onSuccess()
        startDemoLoop()
    }

    private fun startBleSession(start: PendingStart) {
        val deviceId = start.config.deviceId
        if (deviceId.isNullOrBlank()) {
            failStart(start, "INVALID_DEVICE", "startSession requires deviceId in BLE mode")
            return
        }
        pendingConnect = start
        connectAttempt++
        val device = bluetoothAdapter.getRemoteDevice(deviceId)
        gatt = device.connectGatt(this, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        Log.d(TAG, "connectGatt $deviceId attempt=$connectAttempt")
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            Log.d(TAG, "onConnectionStateChange status=$status newState=$newState")
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> gatt.requestMtu(517)
                BluetoothProfile.STATE_DISCONNECTED -> {
                    val wasConnecting = pendingConnect
                    val wasIntentional = intentionalDisconnect
                    clearGatt(markIntentional = false)
                    stopPolling()
                    if (wasIntentional) {
                        intentionalDisconnect = false
                    } else if (wasConnecting != null) {
                        if (status == 133 && connectAttempt < 2) {
                            Log.w(TAG, "status=133 during connect, retrying once")
                            mainHandler.postDelayed({ startBleSession(wasConnecting) }, 250)
                        } else {
                            failStart(wasConnecting, "DISCONNECTED", "Device disconnected during connect (status=$status)")
                        }
                    } else {
                        setError("Board disconnected")
                        emitEvent("onDisconnected", mapOf("status" to status))
                    }
                }
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            Log.d(TAG, "onMtuChanged mtu=$mtu status=$status")
            try {
                val refresh = gatt.javaClass.getMethod("refresh")
                Log.d(TAG, "gatt.refresh() = ${refresh.invoke(gatt)}")
            } catch (e: Exception) {
                Log.w(TAG, "gatt.refresh() not available: ${e.message}")
            }
            gatt.discoverServices()
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
        cancelCccdTimeout()
        val start = pendingConnect ?: return
        pendingConnect = null
        status = "connected"
        emitState()
        emitEvent("onConnected", mapOf("mtu" to 517))
        showNotification("Discovering board...")
        start.onSuccess()
        mainHandler.postDelayed({ sendPayload(byteArrayOf(COMM_FW_VERSION.toByte())) }, 500)
        mainHandler.postDelayed({ sendPayload(byteArrayOf(COMM_PING_CAN.toByte())) }, 800)
        if (canId != null) startPolling()
    }

    private fun handleFrameChunk(chunk: ByteArray) {
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

    private fun startDemoLoop() {
        val session = config ?: return
        demo = DemoBoard()
        demoRunnable = object : Runnable {
            override fun run() {
                lastPollAt = System.currentTimeMillis() - demo.nextLatency()
                val payload = demo.nextPayload()
                handleFrameChunk(VescPacketCodec.encode(payload))
                mainHandler.postDelayed(this, session.pollIntervalMs)
            }
        }
        mainHandler.post(demoRunnable!!)
    }

    private fun stopDemoLoop() {
        demoRunnable?.let { mainHandler.removeCallbacks(it) }
        demoRunnable = null
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
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            g.writeCharacteristic(tx, bytes, writeType) == BluetoothStatusCodes.SUCCESS
        } else {
            @Suppress("DEPRECATION")
            tx.value = bytes
            @Suppress("DEPRECATION")
            tx.writeType = writeType
            @Suppress("DEPRECATION")
            g.writeCharacteristic(tx)
        }
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
        )
    }

    private fun updateLatency(now: Long): Int? {
        if (lastPollAt <= 0) return null
        rttHistory.addLast(max(0, now - lastPollAt))
        while (rttHistory.size > 5) rttHistory.removeFirst()
        return rttHistory.average().roundToInt()
    }

    private fun stopCurrentSession(emitDisconnected: Boolean) {
        cancelCccdTimeout()
        stopPolling()
        stopDemoLoop()
        clearGatt(markIntentional = true)
        pendingConnect = null
        canId = null
        telemetry = null
        error = null
        status = "idle"
        showNotification()
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

    private fun failPendingConnect(code: String, message: String) {
        pendingConnect?.let { failStart(it, code, message) }
    }

    private fun failStart(start: PendingStart, code: String, message: String) {
        pendingConnect = null
        setError(message)
        showNotification(message)
        start.onError(code, message)
    }

    private fun setStatus(next: String) {
        status = next
        emitState()
    }

    private fun setError(message: String) {
        status = "error"
        error = message
        emitEvent("onError", mapOf("message" to message))
        emitState()
    }

    private fun emitState() {
        emitEvent("onSessionState", sessionStateMap())
    }

    private fun emitEvent(name: String, body: Map<String, Any?>) {
        emitEvent?.invoke(name, body)
    }

    private fun sessionStateMap(): Map<String, Any?> = mapOf(
        "status" to status,
        "mode" to config?.mode,
        "deviceId" to config?.deviceId,
        "deviceName" to config?.deviceName,
        "canId" to canId,
        "telemetry" to telemetry?.toMap(),
        "error" to error,
    )

    private fun registerStopReceiver() {
        val filter = IntentFilter(ACTION_STOP_FROM_NOTIFICATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(stopReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(stopReceiver, filter)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "VESC Board Monitoring",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Shows while connected to your VESC board"
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
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_DEFAULT)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Disconnect",
                buildStopIntent(),
            )
            .build()
    }

    private fun buildStopIntent(): PendingIntent {
        val intent = Intent(ACTION_STOP_FROM_NOTIFICATION).apply { setPackage(packageName) }
        return PendingIntent.getBroadcast(
            this,
            0,
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

    private fun formatNotificationText(values: RefloatTelemetry): String {
        if (values.hasFault) return "Fault ${values.faultCode}"
        return String.format(
            "%.1f km/h | %.0f%% duty | %.1fV",
            abs(values.speed),
            values.dutyCycle * 100.0,
            values.batteryVoltage,
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

private class DemoBoard {
    private val phases = listOf("idle", "mounting", "accelerating", "cruising", "tiltback", "decelerating", "fault")
    private val durations = mapOf(
        "idle" to 4_000L,
        "mounting" to 2_000L,
        "accelerating" to 5_000L,
        "cruising" to 8_000L,
        "tiltback" to 3_000L,
        "decelerating" to 4_000L,
        "fault" to 3_000L,
    )
    private var phaseIndex = 0
    private var phaseStart = System.currentTimeMillis()
    private var odometer = 0.0
    private var tempMosfet = 30.0
    private var tempMotor = 30.0

    fun nextLatency(): Long = 30L + (Math.random() * 30).roundToInt()

    fun nextPayload(): ByteArray {
        val now = System.currentTimeMillis()
        val phase = phases[phaseIndex]
        val duration = durations[phase] ?: 1000L
        val elapsed = now - phaseStart
        val t = (elapsed.toDouble() / duration).coerceIn(0.0, 1.0)
        if (elapsed >= duration) {
            phaseIndex = (phaseIndex + 1) % phases.size
            phaseStart = now
        }

        val values = demoValues(phase, t)
        odometer += (abs(values.speed) / 3.6) * 0.5
        val riding = phase in listOf("accelerating", "cruising", "tiltback", "decelerating")
        tempMosfet = approach(tempMosfet, if (riding) 65.0 else 30.0, if (riding) 0.02 else 0.01)
        tempMotor = approach(tempMotor, if (riding) 55.0 else 30.0, if (riding) 0.02 else 0.01)
        return buildPayload(values)
    }

    private fun demoValues(phase: String, t: Double): DemoValues {
        val batteryVoltage = max(58.0, 63.5 - (odometer / 1000.0) * 0.8)
        return when (phase) {
            "mounting" -> DemoValues(batteryVoltage = batteryVoltage, state = if (t > 0.5) 1 else 0, switchState = if (t > 0.5) 3 else 0, adc1 = lerp(0.0, 0.85, t), adc2 = lerp(0.0, 0.85, t))
            "accelerating" -> ridingValues(batteryVoltage, lerp(0.0, 22.0, t) + jitter(0.3), lerp(0.0, -4.5, t) + jitter(0.2), lerp(0.0, 18.0, t) + jitter(1.0), lerp(0.0, 0.35, t), 1)
            "cruising" -> ridingValues(batteryVoltage, 20.0 + jitter(1.5), -1.5 + jitter(0.5), 6.0 + jitter(2.0), 0.30 + jitter(0.03), 1)
            "tiltback" -> ridingValues(batteryVoltage, lerp(22.0, 15.0, t) + jitter(0.5), lerp(-4.5, 3.5, t) + jitter(0.3), lerp(18.0, 8.0, t) + jitter(1.0), lerp(0.35, 0.20, t), 2)
            "decelerating" -> ridingValues(batteryVoltage, lerp(15.0, 0.0, t) + jitter(0.2), lerp(3.5, 0.0, t) + jitter(0.2), lerp(8.0, 0.0, t) + jitter(0.5), lerp(0.20, 0.0, t), 1)
            "fault" -> DemoValues(batteryVoltage = batteryVoltage, hasFault = true, faultCode = 11)
            else -> DemoValues(batteryVoltage = batteryVoltage, state = 0)
        }
    }

    private fun ridingValues(batteryVoltage: Double, speed: Double, pitch: Double, current: Double, duty: Double, state: Int): DemoValues {
        return DemoValues(
            batteryVoltage = batteryVoltage,
            state = state,
            switchState = 3,
            adc1 = 0.85,
            adc2 = 0.85,
            speed = speed,
            erpm = ((speed / 3.6) * 30 * 60).roundToInt(),
            dutyCycle = duty,
            motorCurrent = current,
            batteryCurrent = current * 0.4,
            pitch = pitch,
            balancePitch = pitch,
            balanceCurrent = current * 0.6,
        )
    }

    private fun buildPayload(v: DemoValues): ByteArray {
        if (v.hasFault) {
            return byteArrayOf(COMM_CUSTOM_APP_DATA.toByte(), REFLOAT_MAGIC.toByte(), REFLOAT_GET_ALLDATA.toByte(), REFLOAT_FAULT_MODE.toByte(), v.faultCode.toByte())
        }
        val payload = ByteArray(42)
        payload[0] = COMM_CUSTOM_APP_DATA.toByte()
        payload[1] = REFLOAT_MAGIC.toByte()
        payload[2] = REFLOAT_GET_ALLDATA.toByte()
        payload[3] = 2
        putInt16(payload, 4, (v.balanceCurrent * 10).roundToInt())
        putInt16(payload, 6, (v.balancePitch * 10).roundToInt())
        putInt16(payload, 8, (v.roll * 10).roundToInt())
        payload[10] = v.state.toByte()
        payload[11] = v.switchState.toByte()
        payload[12] = (v.adc1 * 50).roundToInt().toByte()
        payload[13] = (v.adc2 * 50).roundToInt().toByte()
        payload[14] = 128.toByte()
        payload[15] = 128.toByte()
        payload[16] = 128.toByte()
        payload[17] = 128.toByte()
        payload[18] = 128.toByte()
        payload[19] = 128.toByte()
        putInt16(payload, 20, (v.pitch * 10).roundToInt())
        payload[22] = 128.toByte()
        putInt16(payload, 23, (v.batteryVoltage * 10).roundToInt())
        putInt16(payload, 25, v.erpm)
        putInt16(payload, 27, ((v.speed / 3.6) * 10).roundToInt())
        putInt16(payload, 29, (v.motorCurrent * 10).roundToInt())
        putInt16(payload, 31, (v.batteryCurrent * 10).roundToInt())
        payload[33] = ((v.dutyCycle * 100).roundToInt() + 128).toByte()
        payload[34] = 222.toByte()
        payload[39] = (tempMosfet * 2).roundToInt().toByte()
        payload[40] = (tempMotor * 2).roundToInt().toByte()
        return payload
    }
}

private data class DemoValues(
    val hasFault: Boolean = false,
    val faultCode: Int = 0,
    val batteryVoltage: Double,
    val state: Int = 0,
    val switchState: Int = 0,
    val adc1: Double = 0.0,
    val adc2: Double = 0.0,
    val speed: Double = 0.0,
    val erpm: Int = 0,
    val dutyCycle: Double = 0.0,
    val motorCurrent: Double = 0.0,
    val batteryCurrent: Double = 0.0,
    val pitch: Double = 0.0,
    val roll: Double = 0.0,
    val balancePitch: Double = 0.0,
    val balanceCurrent: Double = 0.0,
)

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

private fun putInt16(bytes: ByteArray, offset: Int, value: Int) {
    bytes[offset] = ((value shr 8) and 0xff).toByte()
    bytes[offset + 1] = (value and 0xff).toByte()
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

private fun lerp(a: Double, b: Double, t: Double): Double = a + (b - a) * t

private fun approach(current: Double, target: Double, rate: Double): Double = current + (target - current) * rate

private fun jitter(amplitude: Double): Double = (Math.random() * 2.0 - 1.0) * amplitude
