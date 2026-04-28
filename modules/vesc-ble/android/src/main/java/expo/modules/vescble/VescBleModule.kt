package expo.modules.vescble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val TAG = "VescBle"
private const val DEFAULT_BOARD_NAME = "VESC Board"
private const val NUS_SERVICE_UUID_STRING = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
private val VESC_NAME_PREFIXES = listOf("vesc", "float wheel", "floatwheel", "onewheel")

@SuppressLint("MissingPermission") // permissions are requested at the JS/RN layer
class VescBleModule : Module() {
  private var scanner: android.bluetooth.le.BluetoothLeScanner? = null
  private var scanCallback: ScanCallback? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  private val context: Context get() = appContext.reactContext
    ?: throw IllegalStateException("No React context")
  private val btAdapter: BluetoothAdapter get() =
    (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

  override fun definition() = ModuleDefinition {
    Name("VescBle")

    VescForegroundService.emitEvent = { name, body ->
      mainHandler.post { sendEvent(name, body) }
    }

    Events(
      "onDevice",
      "onNotification",
      "onConnected",
      "onDisconnected",
      "onError",
      "onStopRequested",
      "onSessionState",
      "onTelemetry",
    )

    Function("scan") { startScan() }
    Function("stopScan") { stopScanInternal() }
    Function("getSessionState") {
      VescForegroundService.currentState()
    }

    // Compatibility helpers. New JS should call startSession/stopSession directly.
    Function("startForegroundService") { name: String ->
      startSession(
        mapOf(
          "mode" to "demo",
          "deviceName" to name,
          "pollIntervalMs" to 500,
        ),
        null,
      )
    }
    Function("stopForegroundService") {
      VescForegroundService.stopSession(context.applicationContext)
    }
    Function("updateNotification") { text: String ->
      VescForegroundService.updateNotification(text)
    }

    AsyncFunction("connect") { deviceId: String, promise: Promise ->
      startSession(
        mapOf(
          "mode" to "ble",
          "deviceId" to deviceId,
          "deviceName" to DEFAULT_BOARD_NAME,
          "pollIntervalMs" to 500,
        ),
        promise,
      )
    }
    AsyncFunction("send") { base64: String, promise: Promise ->
      if (VescForegroundService.send(base64)) {
        promise.resolve(null)
      } else {
        promise.reject("NOT_CONNECTED", "No active BLE session", null)
      }
    }
    AsyncFunction("disconnect") { promise: Promise ->
      stopSession(promise)
    }
    AsyncFunction("startSession") { options: Map<String, Any?>, promise: Promise ->
      startSession(options, promise)
    }
    AsyncFunction("stopSession") { promise: Promise ->
      stopSession(promise)
    }
  }

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
        val isKnownName = VESC_NAME_PREFIXES.any { name.lowercase().startsWith(it) }
        val hasNus = serviceUUIDs.any { it.equals(NUS_SERVICE_UUID_STRING, ignoreCase = true) }
        if (!isKnownName && !hasNus) return

        sendEvent("onDevice", mapOf(
          "id" to device.address,
          "name" to name,
          "rssi" to result.rssi,
          "serviceUUIDs" to serviceUUIDs,
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
      cb,
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

  private fun startSession(options: Map<String, Any?>, promise: Promise?) {
    val mode = options["mode"] as? String ?: "ble"
    val deviceId = options["deviceId"] as? String
    val deviceName = options["deviceName"] as? String ?: DEFAULT_BOARD_NAME
    val canId = (options["canId"] as? Number)?.toInt()
    val pollIntervalMs = (options["pollIntervalMs"] as? Number)?.toLong() ?: 500L
    val scenario = options["scenario"] as? String ?: "cruise"

    VescForegroundService.startSession(
      context.applicationContext,
      SessionConfig(
        mode = mode,
        deviceId = deviceId,
        deviceName = deviceName,
        canId = canId,
        pollIntervalMs = pollIntervalMs,
        scenario = scenario,
      ),
      onSuccess = { promise?.resolve(null) },
      onError = { code, message ->
        if (promise != null) {
          promise.reject(code, message, null)
        } else {
          sendEvent("onError", mapOf("message" to message))
        }
      },
    )
  }

  private fun stopSession(promise: Promise) {
    VescForegroundService.stopSession(context.applicationContext) {
      promise.resolve(null)
    }
  }
}
