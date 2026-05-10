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
) {
    private var gatt: BluetoothGatt? = null
    private var txChar: BluetoothGattCharacteristic? = null
    private var pendingCccdWrites = 0
    private var cccdTimeout: Runnable? = null
    private var diagWriteCount = 0
    private var intentionalDisconnect = false

    fun connect(device: BluetoothDevice) {
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
            recorder()?.recordState("gatt:$newState", mapOf("status" to status))
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    listener.onGattConnected()
                    gatt.requestMtu(517)
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    val wasIntentional = intentionalDisconnect
                    clear(markIntentional = false)
                    if (wasIntentional) intentionalDisconnect = false
                    listener.onGattDisconnected(status, wasIntentional)
                }
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            Log.d(VESC_SESSION_TAG, "onMtuChanged mtu=$mtu status=$status")
            if (!gatt.discoverServices()) {
                listener.onGattFailure("DISCOVERY_FAILED", "Could not start service discovery")
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            listener.onGattSubscribing()
            if (status != BluetoothGatt.GATT_SUCCESS) {
                listener.onGattFailure("DISCOVERY_FAILED", "Service discovery failed status=$status")
                return
            }
            val service = gatt.getService(NUS_SERVICE_UUID)
            val tx = service?.getCharacteristic(NUS_TX_UUID)
            val rx = service?.getCharacteristic(NUS_RX_UUID)
            if (service == null || tx == null || rx == null) {
                listener.onGattFailure("NO_CHAR", "NUS service/characteristics not found")
                return
            }
            txChar = tx
            gatt.setCharacteristicNotification(rx, true)
            gatt.setCharacteristicNotification(tx, true)

            val rxCccd = rx.getDescriptor(CCCD_UUID)
            if (rxCccd == null) {
                listener.onGattReady()
                return
            }
            pendingCccdWrites = 1
            if (tx.getDescriptor(CCCD_UUID) != null) pendingCccdWrites = 2
            writeCccd(gatt, rxCccd)

            cccdTimeout = Runnable {
                Log.w(VESC_SESSION_TAG, "CCCD ack timeout, resolving connect")
                listener.onGattReady()
            }
            handler.postDelayed(cccdTimeout!!, 4000)
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
            listener.onGattReady()
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
        ) {
            if (characteristic.uuid == NUS_RX_UUID || characteristic.uuid == NUS_TX_UUID) {
                listener.onGattFrameChunk(value)
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
        if (ok) recorder()?.recordChunk("tx", bytes)
        return ok
    }

    private fun writeCccd(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor) {
        gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
    }

    private fun cancelCccdTimeout() {
        cccdTimeout?.let { handler.removeCallbacks(it) }
        cccdTimeout = null
    }
}
