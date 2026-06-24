package expo.modules.vescble

import android.annotation.SuppressLint
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.util.Log
import expo.modules.vescble.reconnect.ReconnectBlePort
import expo.modules.vescble.reconnect.ReconnectScanMatch
import expo.modules.vescble.runtime.Scheduler

/**
 * Android BLE-scanner implementation of [ReconnectBlePort]. Self-contained: depends only on a
 * scanner supplier and the session [scheduler], so scan callbacks are marshalled onto the session
 * thread before reaching the reconnect state machine.
 */
@SuppressLint("MissingPermission")
internal class ReconnectBleScanner(
    private val scanner: () -> BluetoothLeScanner?,
    private val scheduler: Scheduler,
) : ReconnectBlePort {
    private var activeCallback: ScanCallback? = null

    override fun hasScanner(): Boolean = scanner() != null

    override fun startScan(
        targetId: String,
        onFound: (ReconnectScanMatch) -> Unit,
        onFailed: (errorCode: Int) -> Unit,
    ): Boolean {
        val scanner = scanner() ?: return false
        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                if (!result.device.address.equals(targetId, ignoreCase = true)) return
                scheduler.post { onFound(ReconnectScanMatch(result.device.address, result.rssi)) }
            }

            override fun onScanFailed(errorCode: Int) {
                scheduler.post { onFailed(errorCode) }
            }
        }
        activeCallback = cb
        scanner.startScan(
            null,
            ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
                .build(),
            cb,
        )
        Log.d(VESC_SESSION_TAG, "Reconnect scan started for $targetId")
        return true
    }

    override fun stopScan() {
        val cb = activeCallback ?: return
        activeCallback = null
        try {
            scanner()?.stopScan(cb)
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Reconnect scan stop failed: ${e.message}")
        }
    }
}
