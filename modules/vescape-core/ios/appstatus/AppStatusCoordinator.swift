import Foundation

/// One App Status fetch attempt. `nil` body means "no usable response" (transport or HTTP error).
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/appstatus/AppStatusCoordinator.kt `AppStatusTransport`
typealias AppStatusTransport = (_ url: String, _ appVersion: String, _ onResult: @escaping (Data?) -> Void) -> Void

/// Process-owned App Status truth. Native reads the installed marketing version, fetches
/// `GET /api/app-status` on every foreground, and keeps the last **successful** result for the life
/// of the process.
///
/// Failure semantics (ADR 0025):
/// - No successful result yet -> stays `nil`: the app fails open and behaves as `current`.
/// - A successful result exists -> a later failure keeps it; losing the network never clears a
///   known state.
/// - Nothing is persisted, so a fresh process starts unknown again.
///
/// Main-thread affine: lifecycle hooks call in on the main thread and the URLSession transport hops
/// back there before touching state.
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/appstatus/AppStatusCoordinator.kt
final class AppStatusCoordinator {
  /// Public App Status route on the Vescape server.
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/appstatus/AppStatusCoordinator.kt `APP_STATUS_PATH`
  static let appStatusPath = "/api/app-status"

  /// Carries the installed marketing version on every app-originated request. The server resolves
  /// its Release Policy ranges from it.
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/appstatus/AppStatusCoordinator.kt `APP_VERSION_HEADER`
  static let appVersionHeader = "Vescape-App-Version"

  /// Vescape backend origin. Native fetches App Status before JS is ready, so it cannot receive the
  /// URL from JS the way Group Ride does — it holds the production origin itself.
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/appstatus/AppStatusCoordinator.kt `SERVER_BASE_URL`
  /// @parity /src/config/server.ts `SERVER_URL`
  static let serverBaseUrl = "https://vescape.app"

  /// Stable iOS download route. Server-owned redirect, so the app never hardcodes the final store
  /// destination.
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/appstatus/AppStatusCoordinator.kt `androidDownloadUrl`
  static let iosDownloadUrl = "\(serverBaseUrl)/download/ios"

  private static let callTimeoutSeconds: TimeInterval = 10

  /// Process singleton — its in-memory state must outlive JS runtime reloads.
  static let shared = AppStatusCoordinator(
    installedVersion: installedMarketingVersion(),
    baseUrl: serverBaseUrl,
    transport: urlSessionTransport()
  )

  /// Last successful App Status for this process, or `nil` while none has been fetched.
  private(set) var current: AppStatus?

  /// Notified on every state change so the module can mirror it to JS.
  var onChange: ((AppStatus?) -> Void)?

  private let installedVersion: String
  private let baseUrl: String
  private let transport: AppStatusTransport
  private var refreshing = false

  init(installedVersion: String, baseUrl: String, transport: @escaping AppStatusTransport) {
    self.installedVersion = installedVersion
    self.baseUrl = baseUrl
    self.transport = transport
  }

  /// Fetch App Status now. Foreground events arrive repeatedly (and a cold start fires both create
  /// and foreground), so a refresh asked for while one is already in flight is dropped — the
  /// in-flight request answers it, and the next foreground picks up anything newer.
  func refresh() {
    guard !refreshing, !installedVersion.isEmpty else { return }
    refreshing = true
    transport("\(baseUrl)\(Self.appStatusPath)", installedVersion) { [weak self] body in
      self?.onFetched(body)
    }
  }

  private func onFetched(_ body: Data?) {
    refreshing = false
    guard let body, let status = decodeAppStatus(body) else {
      // Fail open when nothing is known yet; keep the last success when something is.
      NSLog("[AppStatus] refresh failed; keeping \(current == nil ? "unknown" : "last") state")
      return
    }
    current = status
    onChange?(status)
  }

  /// Installed marketing version (`CFBundleShortVersionString`) — the same value Release Policy
  /// ranges match on both platforms. Build numbers are never used.
  /// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/appstatus/AppStatusCoordinator.kt `installedMarketingVersion`
  private static func installedMarketingVersion() -> String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
  }

  /// Default transport: one short-timeout GET, result handed back on the main thread.
  private static func urlSessionTransport() -> AppStatusTransport {
    { url, appVersion, onResult in
      guard let target = URL(string: url) else {
        DispatchQueue.main.async { onResult(nil) }
        return
      }
      var request = URLRequest(url: target)
      request.timeoutInterval = callTimeoutSeconds
      request.setValue(appVersion, forHTTPHeaderField: appVersionHeader)
      URLSession.shared.dataTask(with: request) { data, response, _ in
        let ok = (response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
        DispatchQueue.main.async { onResult(ok ? data : nil) }
      }.resume()
    }
  }
}
