import Foundation

private let CONFIG_CHUNK_LENGTH = 384
private let CONFIG_SCHEMA_TIMEOUT_MS: Int64 = 10_000
private let CONFIG_READ_TIMEOUT_MS: Int64 = 8_000

private struct PendingConfigRead {
  let onSuccess: ([String: Any?]) -> Void
  let onError: (String, String) -> Void
}

private enum ConfigReadState {
  case idle
  case collectingXml(ConfigReadContext, [UInt8], Int?)
  case awaitingConfig(ConfigReadContext, [UInt8])
}

private struct ConfigReadContext {
  let opId: String
  let canId: Int?
  let transport: BoardTransport
  let wasPolling: Bool
  let appBoardId: String?
  let fwVersion: String?
  var refloatVersion: String?
}

/// Read-side iOS peer of Android `ConfigRWController`: pauses polling, reads Refloat XML schema +
/// config bytes over BLE, decodes a snapshot, seeds the "Main" Tune Profile, then resumes polling.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/ConfigRWController.kt
internal final class ConfigReadController {
  private var state: ConfigReadState = .idle
  private var callbacks: PendingConfigRead?
  private var timeoutGeneration: Int64 = 0

  var isInFlight: Bool {
    if case .idle = state { return false }
    return true
  }

  func consumeRead(
    connection: ConfigReadConnection,
    onSuccess: @escaping ([String: Any?]) -> Void,
    onError: @escaping (String, String) -> Void
  ) {
    if isInFlight {
      onError(RefloatConfigErrorCode.CONFIG_REQUEST_IN_FLIGHT.rawValue, "Config operation already in flight")
      return
    }
    guard connection.phase == .connected, connection.appBoardId != nil else {
      onError(
        RefloatConfigErrorCode.BOARD_NOT_CONNECTED.rawValue,
        "Board must be connected before reading Refloat config"
      )
      return
    }
    let wasPolling = connection.isPollingActive()
    connection.stopPolling()
    callbacks = PendingConfigRead(onSuccess: onSuccess, onError: onError)
    let ctx = ConfigReadContext(
      opId: UUID().uuidString.lowercased(),
      canId: connection.transport.canId,
      transport: connection.transport,
      wasPolling: wasPolling,
      appBoardId: connection.appBoardId,
      fwVersion: connection.fwVersion,
      refloatVersion: nil
    )
    state = .collectingXml(ctx, [], nil)
    scheduleTimeout(.CONFIG_SCHEMA_TIMEOUT, CONFIG_SCHEMA_TIMEOUT_MS, connection)
    guard send(connection, RefloatConfigProtocol.buildGetInfo(transport: ctx.transport)) else { return }
    _ = send(connection, buildXmlRequest(ctx.transport, expected: nil, nextOffset: 0))
  }

  func onPayload(_ payload: [UInt8], connection: ConfigReadConnection) -> Bool {
    guard isInFlight else { return false }
    let cmd = payloadCommand(payload)
    if cmd == COMM_CUSTOM_APP_DATA {
      applyInfo(payload)
      return true
    }
    if cmd == COMM_GET_CUSTOM_CONFIG_XML {
      applyXml(payload, connection)
      return true
    }
    if cmd == COMM_GET_CUSTOM_CONFIG {
      applyConfig(payload, connection)
      return true
    }
    return false
  }

  func onSessionTerminated(_ message: String, connection: ConfigReadConnection) {
    guard isInFlight else { return }
    fail(
      code: .BOARD_NOT_CONNECTED,
      message: message,
      rawConfig: nil,
      resumePolling: false,
      connection: connection
    )
  }

  private func applyInfo(_ payload: [UInt8]) {
    let version: String?
    switch RefloatConfigProtocol.parseGetInfoResponse(payload) {
    case .success(let info): version = info.version
    case .failure: version = nil
    }
    guard let version else { return }
    switch state {
    case .collectingXml(var ctx, let xmlBytes, let expected):
      ctx.refloatVersion = version
      state = .collectingXml(ctx, xmlBytes, expected)
    case .awaitingConfig(var ctx, let xmlBytes):
      ctx.refloatVersion = version
      state = .awaitingConfig(ctx, xmlBytes)
    case .idle:
      break
    }
  }

  private func applyXml(_ payload: [UInt8], _ connection: ConfigReadConnection) {
    guard case .collectingXml(let ctx, let xmlBytes, _) = state else { return }
    switch RefloatConfigProtocol.parseCustomConfigXmlResponse(payload) {
    case .failure(let message):
      fail(code: .UNEXPECTED_CONFIG_RESPONSE, message: message, rawConfig: nil, connection: connection)
    case .success(let chunk):
      let merged = xmlBytes + chunk.chunk
      let nextOffset = chunk.offset + chunk.chunk.count
      if nextOffset >= chunk.totalLength {
        state = .awaitingConfig(ctx, merged)
        cancelTimeout()
        scheduleTimeout(.CONFIG_READ_TIMEOUT, CONFIG_READ_TIMEOUT_MS, connection)
        _ = send(connection, RefloatConfigProtocol.buildGetCustomConfig(transport: ctx.transport, confInd: 0))
      } else {
        state = .collectingXml(ctx, merged, chunk.totalLength)
        cancelTimeout()
        scheduleTimeout(.CONFIG_SCHEMA_TIMEOUT, CONFIG_SCHEMA_TIMEOUT_MS, connection)
        _ = send(connection, buildXmlRequest(ctx.transport, expected: chunk.totalLength, nextOffset: nextOffset))
      }
    }
  }

  private func applyConfig(_ payload: [UInt8], _ connection: ConfigReadConnection) {
    guard case .awaitingConfig(let ctx, let xmlBytes) = state else { return }
    switch RefloatConfigProtocol.parseCustomConfigResponse(payload) {
    case .failure(let message):
      fail(code: .UNEXPECTED_CONFIG_RESPONSE, message: message, rawConfig: nil, connection: connection)
    case .success(let configBytes):
      do {
        let schema = try RefloatConfigSchemaParser.parse(xmlBytes)
        let snapshot = try RefloatConfigDecoder.decode(
          schema: schema,
          rawConfig: configBytes.config,
          boardId: ctx.appBoardId,
          canId: ctx.canId,
          capturedAt: nowMs(),
          fwVersion: ctx.fwVersion,
          refloatVersion: ctx.refloatVersion
        )
        complete(snapshot, connection)
      } catch let error as RefloatConfigSchemaException {
        fail(code: .UNSUPPORTED_SCHEMA, message: error.message, rawConfig: configBytes.config, connection: connection)
      } catch let error as RefloatConfigDecodeException {
        fail(code: .CONFIG_DECODE_FAILED, message: error.message, rawConfig: configBytes.config, connection: connection)
      } catch {
        fail(
          code: .CONFIG_DECODE_FAILED,
          message: error.localizedDescription,
          rawConfig: configBytes.config,
          connection: connection
        )
      }
    }
  }

  private func complete(_ snapshot: RefloatConfigSnapshot, _ connection: ConfigReadConnection) {
    let pending = callbacks
    callbacks = nil
    let resume = currentResumePolling
    state = .idle
    cancelTimeout()
    if resume { connection.startPolling() }
    DispatchQueue.global(qos: .utility).async {
      _ = try? TuneProfileStore.shared.createMainTuneProfileIfMissing(snapshot)
      DispatchQueue.main.async {
        pending?.onSuccess(snapshot.toMap())
      }
    }
  }

  private func fail(
    code: RefloatConfigErrorCode,
    message: String,
    rawConfig: [UInt8]?,
    resumePolling: Bool? = nil,
    connection: ConfigReadConnection
  ) {
    let pending = callbacks
    callbacks = nil
    let resume = resumePolling ?? currentResumePolling
    let opId = currentOpId
    state = .idle
    cancelTimeout()
    if resume { connection.startPolling() }
    connection.captureDiagnostic(
      code == .CONFIG_DECODE_FAILED || code == .UNSUPPORTED_SCHEMA ? "config_decode_failed" : "config_read_failed",
      [
        "operation_id": opId,
        "message": message,
        "error_code": code.rawValue,
        "firmware": connection.fwVersion,
        "raw_config_length": rawConfig?.count,
      ]
    )
    pending?.onError(code.rawValue, message)
  }

  private var currentResumePolling: Bool {
    switch state {
    case .collectingXml(let ctx, _, _), .awaitingConfig(let ctx, _): return ctx.wasPolling
    case .idle: return false
    }
  }

  private var currentOpId: String? {
    switch state {
    case .collectingXml(let ctx, _, _), .awaitingConfig(let ctx, _): return ctx.opId
    case .idle: return nil
    }
  }

  private func send(_ connection: ConfigReadConnection, _ payload: [UInt8]) -> Bool {
    if !connection.sendPayload(payload) {
      fail(code: .GATT_NOT_WRITABLE, message: "Board GATT is not writable", rawConfig: nil, connection: connection)
      return false
    }
    return true
  }

  private func scheduleTimeout(
    _ code: RefloatConfigErrorCode,
    _ timeoutMs: Int64,
    _ connection: ConfigReadConnection
  ) {
    timeoutGeneration += 1
    let generation = timeoutGeneration
    DispatchQueue.main.asyncAfter(deadline: .now() + Double(timeoutMs) / 1000.0) { [weak self] in
      guard let self, self.timeoutGeneration == generation, self.isInFlight else { return }
      self.fail(
        code: code,
        message: "Timed out reading Refloat config",
        rawConfig: nil,
        connection: connection
      )
    }
  }

  private func cancelTimeout() {
    timeoutGeneration += 1
  }

  private func buildXmlRequest(_ transport: BoardTransport, expected: Int?, nextOffset: Int) -> [UInt8] {
    let length = max(0, min(expected.map { $0 - nextOffset } ?? CONFIG_CHUNK_LENGTH, CONFIG_CHUNK_LENGTH))
    return RefloatConfigProtocol.buildGetCustomConfigXml(
      transport: transport,
      confInd: 0,
      length: length,
      offset: nextOffset
    )
  }

  private func payloadCommand(_ payload: [UInt8]) -> Int? {
    guard let first = payload.first else { return nil }
    if Int(first) == COMM_FORWARD_CAN, payload.count >= 3 { return Int(payload[2]) }
    return Int(first)
  }
}

private func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

internal struct ConfigReadConnection {
  let phase: BoardPhase
  let appBoardId: String?
  let transport: BoardTransport
  let fwVersion: String?
  let isPollingActive: () -> Bool
  let stopPolling: () -> Void
  let startPolling: () -> Void
  let sendPayload: ([UInt8]) -> Bool
  let captureDiagnostic: (String, [String: Any?]) -> Void
}

private extension BoardTransport {
  var canId: Int? {
    switch self {
    case .direct: return nil
    case .can(let canId): return canId
    }
  }
}
