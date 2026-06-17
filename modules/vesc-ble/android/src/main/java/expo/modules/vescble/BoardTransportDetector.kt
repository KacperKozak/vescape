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
    emitProgress("ble_connecting")
    phase = Phase.Connecting
    gatt.connect(device)
    armStep(DETECT_CONNECT_TIMEOUT_MS) {
      fail("PROBE_CONNECT_TIMEOUT", "Probe could not connect to the board")
    }
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
        if (sample != null) confirmCurrent()
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
    val payload = probePayload(transport)
    gatt.sendPayload(payload)
    // Re-send once mid-window in case the first request dropped.
    handler.postDelayed({ if (!finished && current === transport) gatt.sendPayload(payload) }, DETECT_PROBE_TIMEOUT_MS / 2)
    armStep(DETECT_PROBE_TIMEOUT_MS) {
      observations.add(TransportDetection.Probe(transport, confirmed = false))
      current = null
      probeNext()
    }
  }

  private fun confirmCurrent() {
    val transport = current ?: return
    cancelStep()
    observations.add(TransportDetection.Probe(transport, confirmed = true))
    recordDiagnostic(
      "board_probe_transport_confirmed",
      mapOf(
        "message" to "Transport confirmed by telemetry sample",
        "transport" to BoardTransport.toBridge(transport),
        "elapsed_ms" to elapsed(),
      ),
    )
    emitProgress("telemetry_confirmed", transport)
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
}
