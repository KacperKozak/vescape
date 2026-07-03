import CoreBluetooth
import Foundation

/// Connection + scan lifecycle callbacks. All fire on the main queue (the central runs there),
/// so the coordinator mutates Board Session state without extra hopping. Mirrors the Android
/// `VescGattListener` phase surface.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescGattClient.kt
internal protocol VescGattListener: AnyObject {
  func onDeviceDiscovered(id: String, name: String, rssi: Int, serviceUUIDs: [String])
  func onScanFailure(_ message: String)
  func onGattConnected()
  func onGattSubscribing()
  func onGattReady()
  func onGattDisconnected(intentional: Bool, message: String)
  func onGattFailure(code: String, message: String)
  func onGattFrameChunk(_ chunk: [UInt8])
}

/// CoreBluetooth wrapper around a single VESC board connection plus BLE scanning. Owns one
/// `CBCentralManager` shared by scan and connect; the coordinator drives phases through the
/// listener. Deliberately dumb: no reconnect, no watchdog, no session identity — those live
/// one layer up.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescGattClient.kt
internal final class VescGattClient: NSObject {
  private weak var listener: VescGattListener?
  private lazy var central = CBCentralManager(delegate: self, queue: nil)

  private var peripheral: CBPeripheral?
  private var txChar: CBCharacteristic?
  private var writeType: CBCharacteristicWriteType = .withoutResponse
  private var pendingNotifyEnables = 0
  private var readyResolved = false
  private var intentionalDisconnect = false

  /// True while emitting discovery devices to the listener (the `scan()` JS API).
  private var isDiscoveryScanning = false
  /// Set while scanning to locate a specific board to connect to.
  private var connectTargetId: UUID?

  /// Deferred until the central reports `.poweredOn`.
  private var pendingDiscoveryScan = false
  private var pendingConnectId: UUID?

  init(listener: VescGattListener) {
    self.listener = listener
    super.init()
    _ = central // Kick off state updates so poweredOn arrives before first use.
  }

  // MARK: - Scan (JS `scan()` API)

  func startScan() {
    isDiscoveryScanning = true
    guard central.state == .poweredOn else {
      pendingDiscoveryScan = true
      return
    }
    beginScan()
  }

  func stopScan() {
    isDiscoveryScanning = false
    pendingDiscoveryScan = false
    // Keep scanning if a connect is still hunting for its target peripheral.
    if connectTargetId == nil {
      central.stopScan()
    }
  }

  // MARK: - Connect

  func connect(peripheralId: String) {
    guard let uuid = UUID(uuidString: peripheralId) else {
      listener?.onGattFailure(code: "INVALID_DEVICE", message: "Malformed BLE id: \(peripheralId)")
      return
    }
    // A lingering peripheral from a previous attempt keeps delivering callbacks; tear it down.
    clear(markIntentional: true)
    intentionalDisconnect = false
    readyResolved = false

    guard central.state == .poweredOn else {
      pendingConnectId = uuid
      return
    }
    connectResolved(uuid)
  }

  private func connectResolved(_ uuid: UUID) {
    if let known = central.retrievePeripherals(withIdentifiers: [uuid]).first {
      connectPeripheral(known)
      return
    }
    if let live = central.retrieveConnectedPeripherals(withServices: [VescGattUUIDs.service]).first(where: {
      $0.identifier == uuid
    }) {
      connectPeripheral(live)
      return
    }
    // Not yet seen this launch: scan until the board advertises, then connect.
    connectTargetId = uuid
    beginScan()
  }

  private func connectPeripheral(_ peripheral: CBPeripheral) {
    self.peripheral = peripheral
    peripheral.delegate = self
    central.connect(peripheral, options: nil)
  }

  func disconnect() {
    clear(markIntentional: true)
  }

  func sendPayload(_ payload: [UInt8]) -> Bool {
    guard let peripheral, let txChar else { return false }
    peripheral.writeValue(Data(VescPacketCodec.encode(payload)), for: txChar, type: writeType)
    return true
  }

  // MARK: - Teardown

  private func clear(markIntentional: Bool) {
    connectTargetId = nil
    if !isDiscoveryScanning {
      central.stopScan()
    }
    if let peripheral {
      if markIntentional { intentionalDisconnect = true }
      central.cancelPeripheralConnection(peripheral)
    }
    peripheral = nil
    txChar = nil
    pendingNotifyEnables = 0
  }

  private func beginScan() {
    // Scan unfiltered, mirroring Android's null-filter scan. VESC boards (Nordic UART BLE
    // modules) don't advertise the NUS service UUID in the advertisement packet — it only
    // appears in the GATT table after connecting — so `withServices: [NUS]` never surfaces
    // them. The board is identified by name/id at the UI layer, not by advertised service.
    central.scanForPeripherals(
      withServices: nil,
      options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
    )
  }

  private func resolveReady() {
    guard !readyResolved else { return }
    readyResolved = true
    listener?.onGattReady()
  }
}

// MARK: - CBCentralManagerDelegate

extension VescGattClient: CBCentralManagerDelegate {
  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    switch central.state {
    case .poweredOn:
      if pendingDiscoveryScan {
        pendingDiscoveryScan = false
        beginScan()
      }
      if let uuid = pendingConnectId {
        pendingConnectId = nil
        connectResolved(uuid)
      }
    case .poweredOff:
      if isDiscoveryScanning || pendingDiscoveryScan {
        listener?.onScanFailure("Bluetooth is off")
      }
      if peripheral != nil || connectTargetId != nil || pendingConnectId != nil {
        listener?.onGattFailure(code: "BLE_OFF", message: "Bluetooth is off")
      }
    case .unauthorized:
      listener?.onScanFailure("Bluetooth permission denied")
    default:
      break
    }
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    if let target = connectTargetId, peripheral.identifier == target {
      connectTargetId = nil
      if !isDiscoveryScanning { central.stopScan() }
      connectPeripheral(peripheral)
      return
    }
    guard isDiscoveryScanning else { return }
    let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
      ?? peripheral.name
      ?? ""
    let serviceUUIDs = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?
      .map { $0.uuidString.lowercased() } ?? []
    listener?.onDeviceDiscovered(
      id: peripheral.identifier.uuidString,
      name: name,
      rssi: RSSI.intValue,
      serviceUUIDs: serviceUUIDs
    )
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    guard peripheral === self.peripheral else { return }
    listener?.onGattConnected()
    peripheral.discoverServices([VescGattUUIDs.service])
  }

  func centralManager(
    _ central: CBCentralManager,
    didFailToConnect peripheral: CBPeripheral,
    error: Error?
  ) {
    guard peripheral === self.peripheral else { return }
    listener?.onGattFailure(code: "CONNECT_FAILED", message: error?.localizedDescription ?? "Connect failed")
  }

  func centralManager(
    _ central: CBCentralManager,
    didDisconnectPeripheral peripheral: CBPeripheral,
    error: Error?
  ) {
    guard peripheral === self.peripheral else { return }
    let wasIntentional = intentionalDisconnect
    intentionalDisconnect = false
    self.peripheral = nil
    txChar = nil
    pendingNotifyEnables = 0
    listener?.onGattDisconnected(
      intentional: wasIntentional,
      message: error?.localizedDescription ?? "Board disconnected"
    )
  }
}

// MARK: - CBPeripheralDelegate

extension VescGattClient: CBPeripheralDelegate {
  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard peripheral === self.peripheral else { return }
    listener?.onGattSubscribing()
    if let error {
      listener?.onGattFailure(code: "DISCOVERY_FAILED", message: error.localizedDescription)
      return
    }
    guard let service = peripheral.services?.first(where: { $0.uuid == VescGattUUIDs.service }) else {
      listener?.onGattFailure(code: "NO_CHAR", message: "NUS service not found")
      return
    }
    peripheral.discoverCharacteristics([VescGattUUIDs.tx, VescGattUUIDs.rx], for: service)
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didDiscoverCharacteristicsFor service: CBService,
    error: Error?
  ) {
    guard peripheral === self.peripheral else { return }
    if let error {
      listener?.onGattFailure(code: "DISCOVERY_FAILED", message: error.localizedDescription)
      return
    }
    let chars = service.characteristics ?? []
    guard
      let tx = chars.first(where: { $0.uuid == VescGattUUIDs.tx }),
      let rx = chars.first(where: { $0.uuid == VescGattUUIDs.rx })
    else {
      listener?.onGattFailure(code: "NO_CHAR", message: "NUS characteristics not found")
      return
    }
    txChar = tx
    writeType = tx.properties.contains(.write) ? .withResponse : .withoutResponse

    // Subscribe to whichever of tx/rx actually notify; the board streams telemetry there.
    let notifiers = [rx, tx].filter { $0.properties.contains(.notify) || $0.properties.contains(.indicate) }
    guard !notifiers.isEmpty else {
      listener?.onGattFailure(code: "NO_CHAR", message: "No notifying NUS characteristic")
      return
    }
    pendingNotifyEnables = notifiers.count
    for characteristic in notifiers {
      peripheral.setNotifyValue(true, for: characteristic)
    }
    // Some boards never ack the subscribe; resolve after a grace period so connect never hangs.
    DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
      self?.resolveReady()
    }
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didUpdateNotificationStateFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    guard peripheral === self.peripheral else { return }
    pendingNotifyEnables = max(0, pendingNotifyEnables - 1)
    if pendingNotifyEnables == 0 {
      resolveReady()
    }
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didUpdateValueFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    guard peripheral === self.peripheral else { return }
    guard characteristic.uuid == VescGattUUIDs.rx || characteristic.uuid == VescGattUUIDs.tx else { return }
    guard let value = characteristic.value else { return }
    listener?.onGattFrameChunk([UInt8](value))
  }
}

/// NUS UUIDs as `CBUUID`, sourced from the shared `VescUartUUIDs` so iOS keeps one truth.
internal enum VescGattUUIDs {
  static let service = CBUUID(nsuuid: VescUartUUIDs.service)
  static let tx = CBUUID(nsuuid: VescUartUUIDs.tx)
  static let rx = CBUUID(nsuuid: VescUartUUIDs.rx)
}
