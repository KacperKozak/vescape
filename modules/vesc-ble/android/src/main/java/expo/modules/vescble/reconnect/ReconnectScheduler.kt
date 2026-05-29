package expo.modules.vescble.reconnect

import expo.modules.vescble.runtime.BoardSession
import expo.modules.vescble.runtime.Cancellable
import expo.modules.vescble.runtime.Scheduler

internal interface ReconnectListener {
    fun isReconnectActive(session: BoardSession): Boolean
    fun onAttempt(session: BoardSession, reason: String, gattStatus: Int?, nextAttempt: Int)
    fun onScanStart(session: BoardSession)
    fun onScanFound(session: BoardSession, match: ReconnectScanMatch)
    fun onScanTimeout(session: BoardSession)
    fun onScanFailed(session: BoardSession, errorCode: Int)
    fun onScanStartFailed(session: BoardSession, error: String?)
    fun onMissingTarget(session: BoardSession)
    fun onScannerUnavailable(session: BoardSession)
    fun startDirectReconnect(session: BoardSession, reason: String)
    fun onMaxAttemptsReached(session: BoardSession, reason: String)
}

internal class ReconnectScheduler(
    private val scheduler: Scheduler,
    private val port: ReconnectBlePort,
    private val listener: ReconnectListener,
    private val maxAttempts: Int = RECONNECT_MAX_ATTEMPTS,
) {
    private var attempt = 0
    private var backoffHandle: Cancellable? = null
    private var scanTimeoutHandle: Cancellable? = null
    private var scanning = false

    val currentAttempt: Int get() = attempt
    val isScanning: Boolean get() = scanning

    fun resetAttempts() {
        attempt = 0
    }

    fun schedule(
        session: BoardSession,
        targetDeviceId: String?,
        reason: String,
        gattStatus: Int?,
    ) {
        if (!session.isActive) return

        val decision = ReconnectPolicy.nextDecision(
            currentAttempt = attempt,
            lastError = reason,
            maxAttempts = maxAttempts,
        )
        if (decision is ReconnectDecision.GiveUp) {
            cancel()
            listener.onMaxAttemptsReached(session, reason)
            return
        }

        val retry = decision as ReconnectDecision.Retry
        attempt = retry.attempt
        listener.onAttempt(session, reason, gattStatus, retry.attempt)

        stopScanInternal()
        backoffHandle?.cancel()
        backoffHandle = scheduler.postDelayed(retry.delayMs) {
            backoffHandle = null
            if (!session.isActive) return@postDelayed
            if (!listener.isReconnectActive(session)) return@postDelayed
            launchScan(session, targetDeviceId)
        }
    }

    private fun launchScan(session: BoardSession, targetDeviceId: String?) {
        if (targetDeviceId.isNullOrBlank()) {
            listener.onMissingTarget(session)
            schedule(session, targetDeviceId, "missing reconnect target", null)
            return
        }
        if (!port.hasScanner()) {
            listener.onScannerUnavailable(session)
            schedule(session, targetDeviceId, "BLE scanner unavailable", null)
            return
        }

        stopScanInternal()
        scanning = true
        val started = try {
            port.startScan(
                targetDeviceId,
                onFound = { match -> handleScanFound(session, match) },
                onFailed = { errorCode -> handleScanFailed(session, targetDeviceId, errorCode) },
            )
        } catch (e: Exception) {
            scanning = false
            listener.onScanStartFailed(session, e.message)
            schedule(session, targetDeviceId, "reconnect scan start failed", null)
            return
        }

        if (!started) {
            scanning = false
            listener.onScanStartFailed(session, null)
            schedule(session, targetDeviceId, "reconnect scan start failed", null)
            return
        }

        listener.onScanStart(session)
        armScanTimeout(session, targetDeviceId)
    }

    private fun handleScanFound(session: BoardSession, match: ReconnectScanMatch) {
        if (!session.isActive || !scanning) return
        stopScanInternal()
        if (!listener.isReconnectActive(session)) return
        listener.onScanFound(session, match)
        listener.startDirectReconnect(session, "scan_found")
    }

    private fun handleScanFailed(session: BoardSession, targetDeviceId: String, errorCode: Int) {
        if (!session.isActive || !scanning) return
        stopScanInternal()
        listener.onScanFailed(session, errorCode)
        schedule(session, targetDeviceId, "reconnect scan failed ($errorCode)", null)
    }

    private fun armScanTimeout(session: BoardSession, targetDeviceId: String) {
        scanTimeoutHandle?.cancel()
        scanTimeoutHandle = scheduler.postDelayed(ReconnectPolicy.scanTimeoutMs()) {
            scanTimeoutHandle = null
            if (!session.isActive || !scanning) return@postDelayed
            stopScanInternal()
            if (!listener.isReconnectActive(session)) return@postDelayed
            listener.onScanTimeout(session)
            listener.startDirectReconnect(session, "scan_timeout")
        }
    }

    private fun stopScanInternal() {
        scanTimeoutHandle?.cancel()
        scanTimeoutHandle = null
        if (scanning) {
            scanning = false
            try {
                port.stopScan()
            } catch (_: Exception) {
                // Port impl handles logging.
            }
        }
    }

    fun stopScan() {
        stopScanInternal()
    }

    fun cancel() {
        backoffHandle?.cancel()
        backoffHandle = null
        stopScanInternal()
    }

    fun cancelAndReset() {
        cancel()
        attempt = 0
    }
}
