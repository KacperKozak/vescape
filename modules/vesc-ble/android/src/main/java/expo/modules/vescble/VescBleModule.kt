package expo.modules.vescble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

private const val TAG = "VescBle"

// Nordic UART Service UUIDs (standard NUS roles)
// Floatwheel app names these from the DEVICE'S perspective:
//   VESC_CHARACTERISTICS_RX_UUID = 6e400002 (device receives  = phone writes here)
//   VESC_CHARACTERISTICS_TX_UUID = 6e400003 (device transmits = notifications come here)
// So notifications arrive on 6e400003, matching standard NUS spec.
private val NUS_SVC_UUID  = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e")
private val NUS_TX_UUID   = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e") // phone writes here
private val NUS_RX_UUID   = UUID.fromString("6e400003-b5a3-f393-e0a9-e50e24dcca9e") // notifications arrive here
private val CCCD_UUID     = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

@SuppressLint("MissingPermission") // permissions are requested at the JS/RN layer
class VescBleModule : Module() {

  // ---- Android BLE handles ----
  private var gatt: BluetoothGatt? = null
  private var txChar: BluetoothGattCharacteristic? = null
  private var scanner: android.bluetooth.le.BluetoothLeScanner? = null
  private var scanCallback: ScanCallback? = null

  // ---- async connect bookkeeping ----
  private var connectPromise: Promise? = null
  private var negotiatedMtu = 244
  private val mainHandler = Handler(Looper.getMainLooper())
  private var cccdTimeoutRunnable: Runnable? = null
  private var pendingCccdWrites = 0

  // ---- Expo context helpers ----
  private val context: Context get() = appContext.reactContext
    ?: throw IllegalStateException("No React context")
  private val btAdapter: BluetoothAdapter get() =
    (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

  // =========================================================================
  // Module definition
  // =========================================================================

  override fun definition() = ModuleDefinition {
    Name("VescBle")

    Events("onDevice", "onNotification", "onConnected", "onDisconnected", "onError")

    // -- synchronous --
    Function("scan") { startScan() }
    Function("stopScan") { stopScanInternal() }

    // -- async --
    AsyncFunction("connect") { deviceId: String, promise: Promise ->
      doConnect(deviceId, promise)
    }
    AsyncFunction("send") { base64: String, promise: Promise ->
      doSend(base64, promise)
    }
    AsyncFunction("disconnect") { promise: Promise ->
      doDisconnect(promise)
    }
  }

  // =========================================================================
  // Scanning
  // =========================================================================

  private fun startScan() {
    stopScanInternal()

    val s = btAdapter.bluetoothLeScanner ?: run {
      sendEvent("onError", mapOf("message" to "BLE scanner unavailable (BT off?)"))
      return
    }

    val cb = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        val device = result.device
        val name = result.scanRecord?.deviceName ?: device.name ?: ""
        val serviceUUIDs = result.scanRecord?.serviceUuids
          ?.map { it.uuid.toString() }
          ?: emptyList()

        sendEvent("onDevice", mapOf(
          "id"           to device.address,
          "name"         to name,
          "rssi"         to result.rssi,
          "serviceUUIDs" to serviceUUIDs
        ))
      }

      override fun onBatchScanResults(results: MutableList<ScanResult>) {
        results.forEach { onScanResult(ScanSettings.CALLBACK_TYPE_ALL_MATCHES, it) }
      }

      override fun onScanFailed(errorCode: Int) {
        Log.e(TAG, "Scan failed errorCode=$errorCode")
        sendEvent("onError", mapOf("message" to "Scan failed: $errorCode"))
      }
    }

    s.startScan(
      null,
      ScanSettings.Builder()
        .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
        .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
        .build(),
      cb
    )

    scanner = s
    scanCallback = cb
    Log.d(TAG, "scan started")
  }

  private fun stopScanInternal() {
    scanner?.stopScan(scanCallback)
    scanner = null
    scanCallback = null
  }

  // =========================================================================
  // Connect
  // =========================================================================

  private fun doConnect(deviceId: String, promise: Promise) {
    // Clean up any lingering connection
    cancelCccdTimeout()
    gatt?.disconnect()
    gatt?.close()
    gatt = null
    txChar = null

    connectPromise = promise
    diagWriteCount = 0

    val device = btAdapter.getRemoteDevice(deviceId)
    gatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    Log.d(TAG, "connectGatt → $deviceId")
  }

  // =========================================================================
  // GATT callback — the core of everything
  // =========================================================================

  private val gattCallback = object : BluetoothGattCallback() {

    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      Log.d(TAG, "onConnectionStateChange status=$status newState=$newState")
      when (newState) {
        BluetoothProfile.STATE_CONNECTED -> {
          Log.d(TAG, "connected — requesting MTU 517")
          gatt.requestMtu(517)
        }
        BluetoothProfile.STATE_DISCONNECTED -> {
          Log.d(TAG, "disconnected status=$status")
          cancelCccdTimeout()
          this@VescBleModule.gatt = null
          this@VescBleModule.txChar = null
          // Reject connect promise if it was still pending
          connectPromise?.reject("DISCONNECTED",
            "Device disconnected during connect (status=$status)", null)
          connectPromise = null
          sendEvent("onDisconnected", mapOf("status" to status))
        }
      }
    }

    override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
      Log.d(TAG, "onMtuChanged mtu=$mtu status=$status")
      negotiatedMtu = mtu
      // Refresh GATT cache for bonded devices to avoid stale attribute handles
      // causing the CCCD write to go to the wrong handle.
      try {
        val refresh = gatt.javaClass.getMethod("refresh")
        val result = refresh.invoke(gatt) as? Boolean
        Log.d(TAG, "gatt.refresh() = $result")
      } catch (e: Exception) {
        Log.w(TAG, "gatt.refresh() not available: ${e.message}")
      }
      gatt.discoverServices()
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      Log.d(TAG, "onServicesDiscovered status=$status")
      if (status != BluetoothGatt.GATT_SUCCESS) {
        connectPromise?.reject("DISCOVERY_FAILED",
          "Service discovery failed status=$status", null)
        connectPromise = null
        return
      }

      val svc = gatt.getService(NUS_SVC_UUID)
      if (svc == null) {
        connectPromise?.reject("NO_SERVICE", "NUS service $NUS_SVC_UUID not found", null)
        connectPromise = null
        return
      }

      val tx  = svc.getCharacteristic(NUS_TX_UUID)
      val rxChar = svc.getCharacteristic(NUS_RX_UUID)

      if (tx == null || rxChar == null) {
        connectPromise?.reject("NO_CHAR", "NUS characteristics not found", null)
        connectPromise = null
        return
      }

      txChar = tx
      Log.d(TAG, "txChar=${tx.uuid} rxChar=${rxChar.uuid}")
      Log.d(TAG, "TX props=0x${tx.properties.toString(16)} RX props=0x${rxChar.properties.toString(16)}")

      // Log ALL descriptors on both chars to confirm what CCCD handles exist
      tx.descriptors.forEach { Log.d(TAG, "  TX descriptor: ${it.uuid}") }
      rxChar.descriptors.forEach { Log.d(TAG, "  RX descriptor: ${it.uuid}") }

      // Subscribe to RX char (6e400003) — standard NUS notify path
      val notifRx = gatt.setCharacteristicNotification(rxChar, true)
      Log.d(TAG, "setCharacteristicNotification(RX 6e400003)=$notifRx")

      // Also subscribe to TX char (6e400002) in case the board notifies on it
      val notifTx = gatt.setCharacteristicNotification(tx, true)
      Log.d(TAG, "setCharacteristicNotification(TX 6e400002)=$notifTx")

      // Write CCCD on RX char first (primary notification path per NUS spec)
      val cccd = rxChar.getDescriptor(CCCD_UUID)
      if (cccd == null) {
        Log.w(TAG, "CCCD descriptor not found on RX char — connecting without explicit write")
        resolveConnectPromise()
        return
      }

      // Track how many CCCDs we've written so we know when both are done
      pendingCccdWrites = 1
      val txCccd = tx.getDescriptor(CCCD_UUID)
      if (txCccd != null) {
        pendingCccdWrites = 2
        Log.d(TAG, "TX char also has CCCD — will write both")
      }

      Log.d(TAG, "writing CCCD 0x0100 on RX char")
      writeCccd(gatt, cccd)

      // Safety net timeout
      val timeout = Runnable {
        Log.w(TAG, "CCCD ack timeout — resolving connect anyway")
        resolveConnectPromise()
      }
      cccdTimeoutRunnable = timeout
      mainHandler.postDelayed(timeout, 4000)
    }

    override fun onDescriptorWrite(
      gatt: BluetoothGatt,
      descriptor: BluetoothGattDescriptor,
      status: Int
    ) {
      Log.d(TAG, "onDescriptorWrite charUuid=${descriptor.characteristic.uuid} uuid=${descriptor.uuid} status=$status")
      if (descriptor.uuid == CCCD_UUID) {
        pendingCccdWrites--
        Log.d(TAG, "CCCD written on ${descriptor.characteristic.uuid} status=$status pendingRemaining=$pendingCccdWrites")

        // If we still need to write the TX char's CCCD, do it now
        if (pendingCccdWrites > 0) {
          val txCccd = gatt.getService(NUS_SVC_UUID)
            ?.getCharacteristic(NUS_TX_UUID)
            ?.getDescriptor(CCCD_UUID)
          if (txCccd != null) {
            Log.d(TAG, "writing CCCD 0x0100 on TX char")
            writeCccd(gatt, txCccd)
            return
          } else {
            pendingCccdWrites = 0
          }
        }

        // All CCCDs written
        cancelCccdTimeout()
        Log.d(TAG, "all CCCDs written — resolving connect")
        resolveConnectPromise()
      }
    }

    override fun onCharacteristicWrite(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      status: Int
    ) {
      Log.d(TAG, "onCharacteristicWrite uuid=${characteristic.uuid} status=$status")
    }

    // -----------------------------------------------------------------------
    // THE KEY FIX: override the API-33 3-param version DIRECTLY.
    // Android 13+ calls this one; the 2-param is only called by its default body.
    // rxandroidble2 only overrides the 2-param — that's why it breaks.
    // We own this callback entirely, so both signatures are handled here.
    // -----------------------------------------------------------------------

    // Accept notifications from EITHER NUS characteristic — belt-and-suspenders until
    // we confirm which UUID the ADV2 firmware uses. Log the UUID so we know.
    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      value: ByteArray                            // API 33+
    ) {
      Log.d(TAG, "onCharacteristicChanged(3-param) uuid=${characteristic.uuid} len=${value.size}")
      if (characteristic.uuid == NUS_RX_UUID || characteristic.uuid == NUS_TX_UUID) {
        sendEvent("onNotification",
          mapOf("value" to Base64.encodeToString(value, Base64.NO_WRAP)))
      }
    }

    @Deprecated("Deprecated in Java")
    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic  // API < 33
    ) {
      val value = characteristic.value ?: return
      Log.d(TAG, "onCharacteristicChanged(2-param) uuid=${characteristic.uuid} len=${value.size}")
      if (characteristic.uuid == NUS_RX_UUID || characteristic.uuid == NUS_TX_UUID) {
        sendEvent("onNotification",
          mapOf("value" to Base64.encodeToString(value, Base64.NO_WRAP)))
      }
    }
  }

  // =========================================================================
  // Send (single chunk, base64-encoded)
  //
  // Diagnostic mode: first 3 writes use WRITE_TYPE_DEFAULT (write-with-response)
  // so onCharacteristicWrite confirms the VESC actually received the command.
  // Subsequent writes use WRITE_TYPE_NO_RESPONSE for throughput.
  // =========================================================================

  private var diagWriteCount = 0

  private fun doSend(base64: String, promise: Promise) {
    val g  = gatt
    val tx = txChar
    if (g == null || tx == null) {
      promise.reject("NOT_CONNECTED", "Not connected", null)
      return
    }

    val bytes = Base64.decode(base64, Base64.NO_WRAP)

    // Use WRITE_WITH_RESPONSE for first 3 writes to confirm VESC receives them.
    // After that, use NO_RESPONSE for throughput.
    val writeType = if (diagWriteCount < 3) {
      diagWriteCount++
      Log.d(TAG, "writeChar DIAG (with-response) #$diagWriteCount len=${bytes.size}")
      BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
    } else {
      BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val status = g.writeCharacteristic(tx, bytes, writeType)
      Log.d(TAG, "writeChar (API33+) status=$status len=${bytes.size} type=$writeType")
      promise.resolve(status)
    } else {
      @Suppress("DEPRECATION")
      tx.value = bytes
      @Suppress("DEPRECATION")
      tx.writeType = writeType
      @Suppress("DEPRECATION")
      val ok = g.writeCharacteristic(tx)
      Log.d(TAG, "writeChar (legacy) ok=$ok len=${bytes.size}")
      promise.resolve(if (ok) 0 else -1)
    }
  }

  // =========================================================================
  // Disconnect
  // =========================================================================

  private fun doDisconnect(promise: Promise) {
    cancelCccdTimeout()
    stopScanInternal()
    gatt?.disconnect()
    gatt?.close()
    gatt = null
    txChar = null
    promise.resolve(null)
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private fun writeCccd(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val s = gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
      Log.d(TAG, "writeDescriptor (API33+) char=${descriptor.characteristic.uuid} status=$s")
    } else {
      @Suppress("DEPRECATION")
      descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
      @Suppress("DEPRECATION")
      val ok = gatt.writeDescriptor(descriptor)
      Log.d(TAG, "writeDescriptor (legacy) char=${descriptor.characteristic.uuid} ok=$ok")
    }
  }

  private fun cancelCccdTimeout() {
    cccdTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
    cccdTimeoutRunnable = null
  }

  private fun resolveConnectPromise() {
    connectPromise?.resolve(null)
    connectPromise = null
    sendEvent("onConnected", mapOf("mtu" to negotiatedMtu))
  }
}
