package expo.modules.vescble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.content.Context
import android.os.Handler
import android.util.Log

private const val DETECT_TAG = "VescDetect"
private const val DETECT_CONNECT_TIMEOUT_MS = 8_000L
private const val DETECT_FW_DELAY_MS = 300L
private const val DETECT_PING_DELAY_MS = 600L
private const val DETECT_GATT_RELEASE_DELAY_MS = 600L

// Re-probing a connected board tears down the live GATT and reconnects immediately; Android
// releases the old connection asynchronously, so connecting too soon yields status 133. Settle
// before the first connect, then retry a bounded number of times with backoff on connect-phase
// drops (133 and friends are transient).
private const val DETECT_PROBE_BMS_DELAY_MS = 300L
private const val DETECT_CONNECT_SETTLE_MS = 500L
private const val DETECT_CONNECT_RETRY_BACKOFF_MS = 400L
private const val DETECT_CONNECT_MAX_ATTEMPTS = 3

/**
 * BLE orchestration that runs a single Board Probe and resolves it through the
 * pure [TransportDetection] brain. It owns its own GATT connection, kept
 * separate from the live Board Session so probing stays out of the runtime hot
 * path, and surfaces live milestones through [onProgress].
 *
 * Flow: connect → ping CAN (collect every responder, not just the first) →
 * probe Direct and each responder by polling telemetry and confirming a
 * transport only once it yields a valid decoded Refloat Telemetry Sample →
 * resolve. Every callback is marshalled onto [handler] so the state machine is
 * single-threaded.
 */
@SuppressLint("MissingPermission")
internal class BoardTransportDetector(
  context: Context,
  private val handler: Handler,
  private val device: BluetoothDevice,
  private val recordDiagnostic: (String, Map<String, Any?>) -> Unit,
  private val onProgress: (Map<String, Any?>) -> Unit,
  private val onComplete: (TransportDetection.Result) -> Unit,
  private val onError: (String, String) -> Unit,
  private val nowMs: () -> Long = { System.currentTimeMillis() },
) : VescGattListener {

  private enum class Phase { Connecting, Pinging, Probing }

  private val reassembler = VescPacketReassembler()
  private val gatt = VescGattClient(context, handler, { null }, this)

  private val responders = linkedSetOf<Int>()
  private val probeQueue = ArrayDeque<BoardTransport>()
  private val observations = mutableListOf<TransportDetection.Probe>()
  private var current: BoardTransport? = null
  private var currentConfirmed = false
  private var currentHasBms = false
  private var connectAttempts = 0
  private var phase = Phase.Connecting
  private var stepTimeout: Runnable? = null
  private var finished = false
  private var startMs = 0L

  private fun elapsed(): Long = nowMs() - startMs

  /** Surface a live probe milestone to JS so UI can show connect/probe steps. */
  private fun emitProgress(
    step: String,
    transport: BoardTransport? = null,
    message: String? = null,
  ) {
    onProgress(
      mapOf(
        "step" to step,
        "elapsedMs" to elapsed(),
        "transport" to BoardTransport.toBridge(transport),
        "message" to message,
      ),
    )
  }

  fun start() {
    startMs = nowMs()
    recordDiagnostic(
      "board_probe_started",
      mapOf("message" to "Board Probe started", "ble_id" to device.address),
    )
    phase = Phase.Connecting
    attemptConnect(initial = true)
  }

  /**
   * Open the probe's GATT connection after a settle delay. The first attempt waits for any
   * just-released live connection to clear; retries back off after a transient connect-phase
   * drop. Each attempt re-closes the previous handle so the stack starts clean.
   */
  private fun attemptConnect(initial: Boolean) {
    if (finished) return
    connectAttempts++
    emitProgress("ble_connecting")
    val delay = if (initial) DETECT_CONNECT_SETTLE_MS else DETECT_CONNECT_RETRY_BACKOFF_MS
    handler.postDelayed({
      if (finished) return@postDelayed
      gatt.clear(markIntentional = true)
      gatt.connect(device)
      armStep(DETECT_CONNECT_TIMEOUT_MS) {
        fail("PROBE_CONNECT_TIMEOUT", "Probe could not connect to the board")
      }
    }, delay)
  }

  // --- VescGattListener (marshalled onto the handler thread) ---

  override fun onGattConnected() {
    handler.post {
      if (finished) return@post
      recordDiagnostic(
        "board_probe_ble_connected",
        mapOf("message" to "BLE connected", "ble_id" to device.address, "elapsed_ms" to elapsed()),
      )
      emitProgress("ble_connected")
    }
  }

  override fun onGattSubscribing() {}

  override fun onGattReady() {
    handler.post {
      if (finished || phase != Phase.Connecting) return@post
      cancelStep()
      recordDiagnostic(
        "board_probe_service_ready",
        mapOf("message" to "VESC service ready", "elapsed_ms" to elapsed()),
      )
      emitProgress("service_ready")
      phase = Phase.Pinging
      handler.postDelayed({ if (!finished) gatt.sendPayload(byteArrayOf(COMM_FW_VERSION.toByte())) }, DETECT_FW_DELAY_MS)
      handler.postDelayed({ if (!finished) gatt.sendPayload(byteArrayOf(COMM_PING_CAN.toByte())) }, DETECT_PING_DELAY_MS)
      armStep(DETECT_CAN_PING_TIMEOUT_MS) { beginProbing() }
    }
  }

  override fun onGattDisconnected(status: Int, intentional: Boolean) {
    handler.post {
      if (finished || intentional) return@post
      if (phase == Phase.Connecting) {
        // Connect-phase drops (typically Android 133 from a not-yet-released prior connection)
        // are transient — retry a bounded number of times before giving up.
        if (connectAttempts < DETECT_CONNECT_MAX_ATTEMPTS) {
          cancelStep()
          recordDiagnostic(
            "board_probe_connect_retry",
            mapOf(
              "message" to "Connect attempt failed, retrying",
              "status" to status,
              "attempt" to connectAttempts,
              "elapsed_ms" to elapsed(),
            ),
          )
          attemptConnect(initial = false)
          return@post
        }
        fail("PROBE_DISCONNECTED", "Board disconnected during probe (status=$status)")
      } else {
        // Connection dropped mid-detection: resolve with whatever was confirmed
        // so far rather than hanging.
        Log.w(DETECT_TAG, "disconnected mid-detection status=$status phase=$phase")
        finishResolved()
      }
    }
  }

  override fun onGattFailure(code: String, message: String) {
    handler.post { if (!finished) fail(code, message) }
  }

  override fun onGattFrameChunk(chunk: ByteArray) {
    handler.post {
      if (finished) return@post
      for (payload in reassembler.feed(chunk)) handlePayload(payload)
    }
  }

  private fun handlePayload(payload: ByteArray) {
    if (payload.isEmpty()) return
    when (payload[0].toInt() and 0xff) {
      COMM_PING_CAN -> if (phase == Phase.Pinging) {
        // Collect EVERY responding CAN id, not just payload[1].
        for (i in 1 until payload.size) responders.add(payload[i].toInt() and 0xff)
      }
      COMM_CUSTOM_APP_DATA -> if (phase == Phase.Probing && current != null) {
        val sample = parseRefloatGetAllData(payload, avgLatency = null, packetAt = nowMs(), location = null)
        if (sample != null) markConfirmed()
      }
      // Direct smart-BMS reply.
      COMM_BMS_GET_VALUES -> if (phase == Phase.Probing && current != null) {
        if (parseBmsValues(payload, nowMs()) != null) markBms()
      }
      // CAN-forwarded smart-BMS reply (telemetry stays bare, but BMS comes wrapped).
      COMM_FORWARD_CAN -> if (phase == Phase.Probing && current != null && payload.size >= 3) {
        if ((payload[2].toInt() and 0xff) == COMM_BMS_GET_VALUES &&
          parseBmsValues(payload.copyOfRange(2, payload.size), nowMs()) != null
        ) {
          markBms()
        }
      }
    }
  }

  // --- Probe sequencing ---

  private fun beginProbing() {
    if (finished) return
    phase = Phase.Probing
    probeQueue.clear()
    probeQueue.addAll(TransportDetection.candidatesToProbe(responders.toList()))
    probeNext()
  }

  private fun probeNext() {
    cancelStep()
    currentConfirmed = false
    currentHasBms = false
    current = probeQueue.removeFirstOrNull()
    val transport = current ?: return finishResolved()
    recordDiagnostic(
      "board_probe_transport_probe_started",
      mapOf(
        "message" to "Probing transport",
        "transport" to BoardTransport.toBridge(transport),
        "elapsed_ms" to elapsed(),
      ),
    )
    emitProgress(
      if (transport is BoardTransport.Can) "probing_can" else "probing_direct",
      transport,
    )
    // Ask for telemetry (confirms the transport) and BMS values (capability) in one
    // window. The BMS reply is best-effort: absence within the window means no BMS.
    sendProbeBurst(transport)
    // Re-send once mid-window in case the first request dropped.
    handler.postDelayed({ sendProbeBurst(transport) }, DETECT_PROBE_TIMEOUT_MS / 2)
    armStep(DETECT_PROBE_TIMEOUT_MS) { finalizeProbe() }
  }

  /**
   * Send the telemetry then BMS request, staggered: Android allows only one
   * write-with-response in flight, so firing both back-to-back drops the second and
   * the BMS reply never comes (false "no BMS"). Spacing them lets each land.
   */
  private fun sendProbeBurst(transport: BoardTransport) {
    if (finished || current !== transport) return
    gatt.sendPayload(probePayload(transport))
    handler.postDelayed({
      if (!finished && current === transport) gatt.sendPayload(bmsProbePayload(transport))
    }, DETECT_PROBE_BMS_DELAY_MS)
  }

  /** Telemetry sample proves the transport works; mark and finish if BMS already seen. */
  private fun markConfirmed() {
    if (currentConfirmed) return
    currentConfirmed = true
    val transport = current ?: return
    emitProgress("telemetry_confirmed", transport)
    maybeFinishProbe()
  }

  /** A smart-BMS answered on the current transport. */
  private fun markBms() {
    if (!currentHasBms) {
      currentHasBms = true
      current?.let { emitProgress("bms_detected", it, "Smart-BMS detected") }
    }
    maybeFinishProbe()
  }

  /**
   * Finish early only once both signals are in — telemetry confirms the transport and
   * a BMS reply proves the capability. To assert "no BMS" we must wait the full window,
   * so a confirmed-but-BMS-less transport rides the [armStep] timeout to [finalizeProbe].
   */
  private fun maybeFinishProbe() {
    if (currentConfirmed && currentHasBms) finalizeProbe()
  }

  private fun finalizeProbe() {
    val transport = current ?: return
    cancelStep()
    observations.add(
      TransportDetection.Probe(transport, confirmed = currentConfirmed, hasBms = currentHasBms),
    )
    if (currentConfirmed) {
      recordDiagnostic(
        "board_probe_transport_confirmed",
        mapOf(
          "message" to "Transport confirmed by telemetry sample",
          "transport" to BoardTransport.toBridge(transport),
          "has_bms" to currentHasBms,
          "elapsed_ms" to elapsed(),
        ),
      )
    }
    current = null
    probeNext()
  }

  private fun finishResolved() {
    if (finished) return
    val result = TransportDetection.resolve(observations)
    val outcome = when (result.outcome) {
      is TransportDetection.Outcome.Resolved -> "resolved"
      is TransportDetection.Outcome.NeedsPick -> "needs-pick"
      TransportDetection.Outcome.None -> "none"
    }
    recordDiagnostic(
      "board_probe_completed",
      mapOf(
        "message" to "Board Probe completed",
        "candidate_count" to result.candidates.size,
        "outcome" to outcome,
        "elapsed_ms" to elapsed(),
      ),
    )
    emitProgress("completed")
    cleanup()
    completeAfterGattRelease { onComplete(result) }
  }

  private fun fail(code: String, message: String) {
    if (finished) return
    recordDiagnostic(
      "board_probe_failed",
      mapOf("message" to message, "code" to code, "elapsed_ms" to elapsed()),
    )
    emitProgress("failed", message = message)
    cleanup()
    completeAfterGattRelease { onError(code, message) }
  }

  private fun cleanup() {
    finished = true
    cancelStep()
    gatt.clear()
  }

  // --- Step timeout helper ---

  private fun armStep(delayMs: Long, action: () -> Unit) {
    cancelStep()
    val runnable = Runnable {
      stepTimeout = null
      if (!finished) action()
    }
    stepTimeout = runnable
    handler.postDelayed(runnable, delayMs)
  }

  private fun cancelStep() {
    stepTimeout?.let { handler.removeCallbacks(it) }
    stepTimeout = null
  }

  private fun completeAfterGattRelease(action: () -> Unit) {
    handler.postDelayed(action, DETECT_GATT_RELEASE_DELAY_MS)
  }

  private fun probePayload(transport: BoardTransport): ByteArray = when (transport) {
    BoardTransport.Direct -> byteArrayOf(
      COMM_CUSTOM_APP_DATA.toByte(),
      REFLOAT_MAGIC.toByte(),
      REFLOAT_GET_ALLDATA.toByte(),
      2,
    )
    is BoardTransport.Can -> byteArrayOf(
      COMM_FORWARD_CAN.toByte(),
      transport.canId.toByte(),
      COMM_CUSTOM_APP_DATA.toByte(),
      REFLOAT_MAGIC.toByte(),
      REFLOAT_GET_ALLDATA.toByte(),
      2,
    )
  }

  private fun bmsProbePayload(transport: BoardTransport): ByteArray = when (transport) {
    BoardTransport.Direct -> byteArrayOf(COMM_BMS_GET_VALUES.toByte())
    is BoardTransport.Can -> byteArrayOf(
      COMM_FORWARD_CAN.toByte(),
      transport.canId.toByte(),
      COMM_BMS_GET_VALUES.toByte(),
    )
  }
}
