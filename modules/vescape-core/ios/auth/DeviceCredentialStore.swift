import Foundation
import Security

struct DeviceCredential: Codable, Equatable {
  let serverUrl: String
  let token: String
  let accountId: String
  var expiresAt: String?
}

enum DeviceCredentialState: String {
  case unavailable
  case ready
  case rejected
}

/// Keychain-backed Device Token storage, readable after first unlock even while screen is locked.
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/auth/DeviceCredentialStore.kt
final class DeviceCredentialStore {
  static let shared = DeviceCredentialStore()
  private let service = "app.vescape.device-auth"
  private let credentialAccount = "credential"
  private let stateKey = "vescape_device_auth_state"
  private let lock = NSRecursiveLock()

  func read() -> DeviceCredential? {
    lock.lock()
    defer { lock.unlock() }
    var query = baseQuery(account: credentialAccount)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data,
          let credential = try? JSONDecoder().decode(DeviceCredential.self, from: data)
    else { return nil }
    return credential
  }

  func write(_ credential: DeviceCredential) throws {
    lock.lock()
    defer { lock.unlock() }
    let data = try JSONEncoder().encode(credential)
    let query = baseQuery(account: credentialAccount)
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
      var insert = query
      attributes.forEach { insert[$0.key] = $0.value }
      guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else {
        throw NSError(domain: "DeviceCredentialStore", code: 1)
      }
    } else if status != errSecSuccess {
      throw NSError(domain: "DeviceCredentialStore", code: Int(status))
    }
    UserDefaults.standard.set(DeviceCredentialState.ready.rawValue, forKey: stateKey)
  }

  func updateExpiry(_ expiresAt: String) {
    lock.lock()
    defer { lock.unlock() }
    guard var credential = read() else { return }
    credential.expiresAt = expiresAt
    try? write(credential)
  }

  func reject() {
    lock.lock()
    defer { lock.unlock() }
    deleteCredential()
    UserDefaults.standard.set(DeviceCredentialState.rejected.rawValue, forKey: stateKey)
  }

  func clear() {
    lock.lock()
    defer { lock.unlock() }
    deleteCredential()
    UserDefaults.standard.set(DeviceCredentialState.unavailable.rawValue, forKey: stateKey)
  }

  func state() -> DeviceCredentialState {
    lock.lock()
    defer { lock.unlock() }
    if read() != nil { return .ready }
    return DeviceCredentialState(
      rawValue: UserDefaults.standard.string(forKey: stateKey) ?? ""
    ) ?? .unavailable
  }

  private func deleteCredential() {
    SecItemDelete(baseQuery(account: credentialAccount) as CFDictionary)
  }

  private func baseQuery(account: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }
}
