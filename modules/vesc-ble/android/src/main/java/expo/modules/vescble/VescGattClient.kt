package expo.modules.vescble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.content.Context
import android.os.Handler
import android.util.Log
import java.util.UUID

private val NUS_SERVICE_UUID = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e")
private val NUS_TX_UUID = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e")
private val NUS_RX_UUID = UUID.fromString("6e400003-b5a3-f393-e0a9-e50e24dcca9e")
private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

internal interface VescGattListener {
    fun onGattConnected()
    fun onGattSubscribing()
    fun onGattDisconnected(status: Int, intentional: Boolean)
    fun onGattReady()
    fun onGattFailure(code: String, message: String)
    fun onGattFrameChunk(chunk: ByteArray)
}

@SuppressLint("MissingPermission")
internal class VescGattClient(
    private val context: Context,
    private val handler: Handler,
    private val recorder: () -> VescSessionRecorder?,
    private val listener: VescGattListener,
    private val dispatchListener: ((() -> Unit) -> Unit) = { it() },
) {
    private var gatt: BluetoothGatt? = null
    private var txChar: BluetoothGattCharacteristic? = null
    private var pendingCccdWrites = 0
    private var cccdTimeout: Runnable? = null
    private var diagWriteCount = 0
    private var intentionalDisconnect = false

    fun connect(device: BluetoothDevice) {
        Log.d(VESC_SESSION_TAG, "gatt connect request device=${device.address}")
        // A lingering gatt from a previous attempt keeps delivering callbacks on the
        // shared callback object and would race this connection; tear it down first.
        if (gatt != null) clear(markIntentional = true)
        // Each connection starts unintentional; the teardown flag belongs to the gatt
        // we just cleared, not to the new one.
        intentionalDisconnect = false
        gatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    fun resetDiagnostics() {
        diagWriteCount = 0
    }

    fun sendPayload(payload: ByteArray): Boolean = sendFramedChunk(VescPacketCodec.encode(payload))

    fun clear(markIntentional: Boolean = true) {
        try {
            cancelCccdTimeout()
            if (markIntentional && gatt != null) intentionalDisconnect = true
            gatt?.disconnect()
            gatt?.close()
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "GATT cleanup failed: ${e.message}")
        }
        gatt = null
        txChar = null
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            Log.d(VESC_SESSION_TAG, "onConnectionStateChange status=$status newState=$newState")
            // Late callback from a previous (already-replaced/cleared) connection. Close it
            // and leave the current session's state untouched — otherwise a stale disconnect
            // would clobber the live gatt and freeze telemetry.
            if (gatt !== this@VescGattClient.gatt) {
                try { gatt.close() } catch (e: Exception) { Log.w(VESC_SESSION_TAG, "stale gatt close failed: ${e.message}") }
                return
            }
            recorder()?.recordState("gatt:$newState", mapOf("status" to status))
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    dispatchListener { listener.onGattConnected() }
                    val requested = gatt.requestMtu(517)
                    Log.d(VESC_SESSION_TAG, "gatt requestMtu requested=$requested")
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    val wasIntentional = intentionalDisconnect
                    clear(markIntentional = false)
                    if (wasIntentional) intentionalDisconnect = false
                    dispatchListener { listener.onGattDisconnected(status, wasIntentional) }
                }
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            if (gatt !== this@VescGattClient.gatt) return
            Log.d(VESC_SESSION_TAG, "onMtuChanged mtu=$mtu status=$status")
            val discoveryStarted = gatt.discoverServices()
            Log.d(VESC_SESSION_TAG, "gatt discoverServices started=$discoveryStarted")
            if (!discoveryStarted) {
                dispatchListener { listener.onGattFailure("DISCOVERY_FAILED", "Could not start service discovery") }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (gatt !== this@VescGattClient.gatt) return
            Log.d(VESC_SESSION_TAG, "onServicesDiscovered status=$status")
            dispatchListener { listener.onGattSubscribing() }
            if (status != BluetoothGatt.GATT_SUCCESS) {
                dispatchListener { listener.onGattFailure("DISCOVERY_FAILED", "Service discovery failed status=$status") }
                return
            }
            val service = gatt.getService(NUS_SERVICE_UUID)
            val tx = service?.getCharacteristic(NUS_TX_UUID)
            val rx = service?.getCharacteristic(NUS_RX_UUID)
            if (service == null || tx == null || rx == null) {
                dispatchListener { listener.onGattFailure("NO_CHAR", "NUS service/characteristics not found") }
                return
            }
            txChar = tx
            val highPriority = gatt.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH)
            Log.d(VESC_SESSION_TAG, "gatt requestConnectionPriority high=$highPriority")
            val rxNotify = gatt.setCharacteristicNotification(rx, true)
            val txNotify = gatt.setCharacteristicNotification(tx, true)
            Log.d(VESC_SESSION_TAG, "gatt set notifications rx=$rxNotify tx=$txNotify")

            val rxCccd = rx.getDescriptor(CCCD_UUID)
            if (rxCccd == null) {
                dispatchListener { listener.onGattReady() }
                return
            }
            pendingCccdWrites = 1
            if (tx.getDescriptor(CCCD_UUID) != null) pendingCccdWrites = 2
            Log.d(VESC_SESSION_TAG, "gatt cccd writes pending=$pendingCccdWrites")
            writeCccd(gatt, rxCccd)

            cccdTimeout = Runnable {
                Log.w(VESC_SESSION_TAG, "CCCD ack timeout, resolving connect pending=$pendingCccdWrites")
                dispatchListener { listener.onGattReady() }
            }
            handler.postDelayed(cccdTimeout!!, 4000)
        }

        override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            if (gatt !== this@VescGattClient.gatt) return
            if (descriptor.uuid != CCCD_UUID) return
            Log.d(VESC_SESSION_TAG, "onDescriptorWrite status=$status pendingBefore=$pendingCccdWrites")
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
            cancelCccdTimeout()
            dispatchListener { listener.onGattReady() }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
        ) {
            if (gatt !== this@VescGattClient.gatt) return
            if (characteristic.uuid == NUS_RX_UUID || characteristic.uuid == NUS_TX_UUID) {
                val chunk = value.copyOf()
                dispatchListener { listener.onGattFrameChunk(chunk) }
            }
        }
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
        val ok = g.writeCharacteristic(tx, bytes, writeType) == BluetoothStatusCodes.SUCCESS
        if (!ok) Log.w(VESC_SESSION_TAG, "gatt writeCharacteristic failed bytes=${bytes.size} writeType=$writeType")
        if (ok) recorder()?.recordChunk("tx", bytes)
        return ok
    }

    private fun writeCccd(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor) {
        val ok = gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) ==
            BluetoothStatusCodes.SUCCESS
        Log.d(VESC_SESSION_TAG, "gatt writeCccd started=$ok")
    }

    private fun cancelCccdTimeout() {
        cccdTimeout?.let { handler.removeCallbacks(it) }
        cccdTimeout = null
    }
}
