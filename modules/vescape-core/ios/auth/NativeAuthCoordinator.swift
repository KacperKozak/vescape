import Foundation

/// Reusable native authenticated HTTP boundary.
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/auth/NativeAuthCoordinator.kt
final class NativeAuthCoordinator {
  static let shared = NativeAuthCoordinator()
  private let store = DeviceCredentialStore.shared

  func stateMap() -> [String: Any?] {
    let credential = store.read()
    return [
      "state": store.state().rawValue,
      "accountId": credential?.accountId,
      "expiresAt": credential?.expiresAt,
    ]
  }

  func provision(
    serverUrl: String,
    token: String,
    accountId: String
  ) async throws -> [String: Any?] {
    let credential = DeviceCredential(
      serverUrl: serverUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/")),
      token: token,
      accountId: accountId,
      expiresAt: nil
    )
    let (data, response) = try await request(credential, path: "/api/account")
    if response.statusCode == 401 {
      store.reject()
      throw NSError(domain: "NativeAuth", code: 401)
    }
    guard (200..<300).contains(response.statusCode),
          let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          json["id"] as? String == accountId
    else { throw NSError(domain: "NativeAuth", code: response.statusCode) }
    try store.write(credential)
    await MainActor.run {
      AppStatusCoordinator.shared.refresh()
    }
    return stateMap()
  }

  func revoke() async throws {
    guard let credential = store.read() else { return }
    let (_, response) = try await request(
      credential,
      path: "/api/auth/device-tokens/current",
      method: "DELETE"
    )
    guard (200..<300).contains(response.statusCode) || response.statusCode == 401 else {
      throw NSError(domain: "NativeAuth", code: response.statusCode)
    }
    store.clear()
  }

  func clear() { store.clear() }

  private func request(
    _ credential: DeviceCredential,
    path: String,
    method: String = "GET"
  ) async throws -> (Data, HTTPURLResponse) {
    guard let url = URL(string: "\(credential.serverUrl)\(path)") else {
      throw NSError(domain: "NativeAuth", code: -1)
    }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = 10
    request.setValue("Bearer \(credential.token)", forHTTPHeaderField: "Authorization")
    request.setValue(
      AppStatusCoordinator.installedMarketingVersion(),
      forHTTPHeaderField: AppStatusCoordinator.appVersionHeader
    )
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw NSError(domain: "NativeAuth", code: -2)
    }
    return (data, http)
  }
}
