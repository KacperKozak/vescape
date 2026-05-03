package expo.modules.vescble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.vescble.telemetry.TelemetryRepository
import kotlinx.coroutines.runBlocking

private const val TAG = "VescBle"
private const val DEFAULT_BOARD_NAME = "VESC Board"
private const val SCAN_RETRY_LIMIT = 3

@SuppressLint("MissingPermission") // permissions are requested at the JS/RN layer
class VescBleModule : Module() {
  private var scanner: android.bluetooth.le.BluetoothLeScanner? = null
  private var scanCallback: ScanCallback? = null
  private var scanRetryCount = 0
  private var scanRetryRunnable: Runnable? = null
  private var locationContextDeviceId: String? = null
  private var locationContextDeviceName: String? = null
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
      "onLocation",
    )

    Function("scan") { startScan(resetRetries = true) }
    Function("stopScan") { stopScanInternal() }
    Function("startLocationUpdates") { options: Map<String, Any?>? -> startLocationUpdates(options) }
    Function("stopLocationUpdates") { stopLocationUpdates() }
    Function("setTelemetryRecordingEnabled") { enabled: Boolean -> setTelemetryRecordingEnabled(enabled) }
    Function("getSessionState") {
      VescForegroundService.currentState()
    }

    AsyncFunction("startAutoConnect") { options: Map<String, Any?>, promise: Promise ->
      val autoOptions = options.toMutableMap()
      autoOptions["autoReconnect"] = true
      startSession(autoOptions, null)
      promise.resolve(null)
    }
    AsyncFunction("stopAutoConnect") { promise: Promise ->
      stopSession(promise)
    }
    AsyncFunction("startSession") { options: Map<String, Any?>, promise: Promise ->
      startSession(options, promise)
    }
    AsyncFunction("stopSession") { promise: Promise ->
      stopSession(promise)
    }
    AsyncFunction("listRecordings") { promise: Promise ->
      promise.resolve(VescForegroundService.listRecordings(context.applicationContext))
    }
    AsyncFunction("deleteRecording") { path: String, promise: Promise ->
      promise.resolve(VescForegroundService.deleteRecording(path))
    }
    AsyncFunction("exportRecording") { path: String, promise: Promise ->
      try {
        promise.resolve(VescForegroundService.exportRecording(context.applicationContext, path))
      } catch (e: Exception) {
        promise.reject("EXPORT_FAILED", e.message ?: "Could not export recording", e)
      }
    }
    AsyncFunction("getTelemetryHistory") Coroutine { options: Map<String, Any?> ->
      TelemetryRepository.get(context.applicationContext).getHistory(options)
    }
    AsyncFunction("getTelemetrySamples") Coroutine { options: Map<String, Any?> ->
      TelemetryRepository.get(context.applicationContext).getSamples(options)
    }
    AsyncFunction("getHistoryRange") Coroutine { options: Map<String, Any?> ->
      TelemetryRepository.get(context.applicationContext).getRange(options)
    }
    AsyncFunction("getTelemetrySummary") {
      runBlocking { TelemetryRepository.get(context.applicationContext).getSummary() }
    }
    AsyncFunction("deleteTelemetryBefore") Coroutine { beforeMs: Double ->
      TelemetryRepository.get(context.applicationContext).deleteBefore(beforeMs.toLong())
    }
    AsyncFunction("clearTelemetryHistory") {
      runBlocking { TelemetryRepository.get(context.applicationContext).clearAll() }
    }
  }

  private fun startScan(resetRetries: Boolean = true) {
    if (resetRetries) {
      scanRetryCount = 0
    }
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
        scanner = null
        scanCallback = null

        if (
          errorCode == ScanCallback.SCAN_FAILED_APPLICATION_REGISTRATION_FAILED &&
          scanRetryCount < SCAN_RETRY_LIMIT
        ) {
          scanRetryCount += 1
          val delayMs = 750L * scanRetryCount
          Log.w(TAG, "Retrying scan after registration failure in ${delayMs}ms")
          val retry = Runnable {
            scanRetryRunnable = null
            startScan(resetRetries = false)
          }
          scanRetryRunnable = retry
          mainHandler.postDelayed(retry, delayMs)
          return
        }

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
    scanRetryRunnable?.let { mainHandler.removeCallbacks(it) }
    scanRetryRunnable = null
    try {
      scanner?.stopScan(scanCallback)
    } catch (e: Exception) {
      Log.w(TAG, "stopScan failed: ${e.message}")
    }
    scanner = null
    scanCallback = null
  }

  private fun startLocationUpdates(options: Map<String, Any?>? = null) {
    val hasFine = ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION) ==
      PackageManager.PERMISSION_GRANTED
    if (!hasFine) {
      sendEvent("onError", mapOf("message" to "Location permission not granted"))
      return
    }
    locationContextDeviceId = options?.get("deviceId") as? String
    locationContextDeviceName = options?.get("deviceName") as? String
    VescForegroundService.startGpsMonitoring(
      context.applicationContext,
      locationContextDeviceId,
      locationContextDeviceName,
    )
  }

  private fun stopLocationUpdates() {
    VescForegroundService.stopGpsMonitoring(context.applicationContext)
    TelemetryRepository.get(context.applicationContext).flushBlocking()
  }

  private fun startSession(options: Map<String, Any?>, promise: Promise?) {
    val mode = options["mode"] as? String ?: "ble"
    val deviceId = options["deviceId"] as? String
    val deviceName = options["deviceName"] as? String ?: DEFAULT_BOARD_NAME
    val canId = (options["canId"] as? Number)?.toInt()
    val pollIntervalMs = (options["pollIntervalMs"] as? Number)?.toLong() ?: 500L
    val recordingEnabled = options["recordingEnabled"] as? Boolean ?: false
    val telemetryRecordingEnabled = options["telemetryRecordingEnabled"] as? Boolean ?: false
    val recordingPath = options["recordingPath"] as? String
    val autoReconnect = options["autoReconnect"] as? Boolean ?: false

    VescForegroundService.startSession(
      context.applicationContext,
      SessionConfig(
        mode = mode,
        deviceId = deviceId,
        deviceName = deviceName,
        canId = canId,
        pollIntervalMs = pollIntervalMs,
        recordingEnabled = recordingEnabled,
        telemetryRecordingEnabled = telemetryRecordingEnabled,
        recordingPath = recordingPath,
        autoReconnect = autoReconnect,
      ),
      onSuccess = { promise?.resolve(null) },
      onError = { code, message ->
        if (promise != null) {
          promise.reject(code, message, null)
        } else if (!autoReconnect) {
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

  private fun setTelemetryRecordingEnabled(enabled: Boolean) {
    VescForegroundService.setTelemetryRecordingEnabled(context.applicationContext, enabled)
    if (!enabled) {
      TelemetryRepository.get(context.applicationContext).flushBlocking()
    }
  }
}
