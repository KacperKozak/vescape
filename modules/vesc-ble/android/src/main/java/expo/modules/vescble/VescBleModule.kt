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
import expo.modules.vescble.telemetry.AppDataRepository
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
  private var scanStatus: String = "idle"
  private var requestedDebugRecordingEnabled = false
  @Volatile
  private var frontendActive = true
  private val observedEvents = mutableSetOf<String>()
  private val mainHandler = Handler(Looper.getMainLooper())

  private val context: Context get() = appContext.reactContext
    ?: throw IllegalStateException("No React context")
  private val btAdapter: BluetoothAdapter get() =
    (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

  override fun definition() = ModuleDefinition {
    Name("VescBle")

    VescForegroundService.emitEvent = { name, body ->
      if (name == "onLiveState" && shouldEmitToFrontend("onLiveState")) {
        mainHandler.post {
          if (shouldEmitToFrontend("onLiveState")) sendEvent("onLiveState", liveStateWithScan(body))
        }
      } else if (shouldEmitToFrontend(name)) {
        mainHandler.post {
          if (shouldEmitToFrontend(name)) sendEvent(name, body)
        }
      }
    }

    Events(
      "onDevice",
      "onError",
      "onLiveState",
      "onTelemetry",
      "onLocation",
    )

    OnStartObserving("onDevice") { startObserving("onDevice") }
    OnStopObserving("onDevice") { stopObserving("onDevice") }
    OnStartObserving("onError") { startObserving("onError") }
    OnStopObserving("onError") { stopObserving("onError") }
    OnStartObserving("onLiveState") { startObserving("onLiveState") }
    OnStopObserving("onLiveState") { stopObserving("onLiveState") }
    OnStartObserving("onTelemetry") { startObserving("onTelemetry") }
    OnStopObserving("onTelemetry") { stopObserving("onTelemetry") }
    OnStartObserving("onLocation") { startObserving("onLocation") }
    OnStopObserving("onLocation") { stopObserving("onLocation") }

    OnActivityEntersForeground {
      frontendActive = true
      VescForegroundService.setAppInForeground(true)
    }
    OnActivityEntersBackground {
      frontendActive = false
      VescForegroundService.setAppInForeground(false)
    }
    OnDestroy {
      frontendActive = false
      VescForegroundService.setAppInForeground(false)
      observedEvents.clear()
      if (VescForegroundService.emitEvent != null) {
        VescForegroundService.emitEvent = null
      }
    }

    Function("scan") { startScan(resetRetries = true) }
    Function("stopScan") { stopScanInternal() }
    Function("startLocationUpdates") { startLocationUpdates() }
    Function("stopLocationUpdates") { stopLocationUpdates() }
    Function("setTelemetryRecordingEnabled") { enabled: Boolean -> setTelemetryRecordingEnabled(enabled) }
    Function("reloadAlertRules") {
      VescForegroundService.reloadAlertRules(context.applicationContext)
    }
    Function("previewAlertSound") { soundType: String ->
      VescForegroundService.previewAlertSound(context.applicationContext, soundType)
    }
    Function("getLiveState") {
      liveStateWithScan(VescForegroundService.currentLiveState(context.applicationContext))
    }
    Function("setSelectedBoard") { boardId: String? ->
      runBlocking { AppDataRepository.get(context.applicationContext).setSelectedBoardId(boardId) }
    }
    Function("setDebugRecordingEnabled") { enabled: Boolean ->
      requestedDebugRecordingEnabled = enabled
    }

    AsyncFunction("selectBoard") Coroutine { boardId: String ->
      selectBoard(boardId)
    }
    AsyncFunction("stopBoard") { promise: Promise ->
      stopBoardSession(promise)
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
    AsyncFunction("deleteTelemetryRange") Coroutine { options: Map<String, Any?> ->
      TelemetryRepository.get(context.applicationContext).deleteRange(options)
    }
    AsyncFunction("clearTelemetryHistory") {
      runBlocking { TelemetryRepository.get(context.applicationContext).clearAll() }
    }
    AsyncFunction("getBoards") {
      runBlocking { AppDataRepository.get(context.applicationContext).getBoards() }
    }
    AsyncFunction("upsertBoard") Coroutine { board: Map<String, Any?> ->
      AppDataRepository.get(context.applicationContext).upsertBoard(board)
    }
    AsyncFunction("deleteBoard") Coroutine { id: String ->
      AppDataRepository.get(context.applicationContext).deleteBoard(id)
    }
    AsyncFunction("getAlertRules") {
      runBlocking { AppDataRepository.get(context.applicationContext).getAlertRules() }
    }
    AsyncFunction("upsertAlertRule") Coroutine { rule: Map<String, Any?> ->
      AppDataRepository.get(context.applicationContext).upsertAlertRule(rule)
      VescForegroundService.reloadAlertRules(context.applicationContext)
    }
    AsyncFunction("setAlertRuleEnabled") Coroutine { id: String, enabled: Boolean ->
      AppDataRepository.get(context.applicationContext).setAlertRuleEnabled(id, enabled)
      VescForegroundService.reloadAlertRules(context.applicationContext)
    }
    AsyncFunction("deleteAlertRule") Coroutine { id: String ->
      AppDataRepository.get(context.applicationContext).deleteAlertRule(id)
      VescForegroundService.reloadAlertRules(context.applicationContext)
    }
    AsyncFunction("getSettings") {
      runBlocking { AppDataRepository.get(context.applicationContext).getSettings() }
    }
    AsyncFunction("updateSetting") Coroutine { key: String, value: Any? ->
      AppDataRepository.get(context.applicationContext).updateSetting(key, value)
      if (key == "liveHistoryLimit") {
        VescForegroundService.setLiveHistoryLimit(value as? Number)
      }
    }
  }

  private fun shouldEmitToFrontend(name: String): Boolean = frontendActive && observedEvents.contains(name)

  private fun startObserving(name: String) {
    observedEvents.add(name)
  }

  private fun stopObserving(name: String) {
    observedEvents.remove(name)
  }

  private fun liveStateWithScan(state: Map<String, Any?>): Map<String, Any?> {
    return state + mapOf(
      "scan" to mapOf(
        "phase" to scanStatus,
        "devices" to emptyList<Map<String, Any?>>(),
        "error" to null,
      ),
    )
  }

  private fun startScan(resetRetries: Boolean = true) {
    if (resetRetries) {
      scanRetryCount = 0
    }
    stopScanInternal()

    val s = btAdapter.bluetoothLeScanner ?: run {
      scanStatus = "error"
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
        scanStatus = "error"

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
    scanStatus = "scanning"
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
    scanStatus = "idle"
  }

  private fun startLocationUpdates() {
    val hasFine = ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION) ==
      PackageManager.PERMISSION_GRANTED
    if (!hasFine) {
      sendEvent("onError", mapOf("message" to "Location permission not granted"))
      return
    }
    VescForegroundService.startGpsMonitoring(context.applicationContext)
  }

  private suspend fun selectBoard(boardId: String) {
    AppDataRepository.get(context.applicationContext).setSelectedBoardId(boardId)
    val board = AppDataRepository.get(context.applicationContext).getBoard(boardId)
      ?: throw IllegalArgumentException("Board not found: $boardId")
    val bleId = board["bleId"] as? String
    if (bleId.isNullOrBlank()) {
      throw IllegalArgumentException("Board has no BLE pairing: $boardId")
    }
    val boardName = board["name"] as? String ?: DEFAULT_BOARD_NAME
    VescForegroundService.startBoardSession(
      context.applicationContext,
      SessionConfig(
        appBoardId = boardId,
        deviceId = bleId,
        deviceName = boardName,
        canId = null,
        pollIntervalMs = 500L,
        recordingEnabled = requestedDebugRecordingEnabled,
        telemetryRecordingEnabled = false,
        autoReconnect = true,
      ),
      onSuccess = {},
      onError = { _, message ->
        sendEvent("onError", mapOf("message" to message))
      },
    )
  }

  private fun stopLocationUpdates() {
    VescForegroundService.stopGpsMonitoring(context.applicationContext)
    TelemetryRepository.get(context.applicationContext).flushBlocking()
  }

  private fun stopBoardSession(promise: Promise) {
    VescForegroundService.stopBoardSession(context.applicationContext) {
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
