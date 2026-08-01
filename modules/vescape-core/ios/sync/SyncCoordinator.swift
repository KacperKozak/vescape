import Foundation
import Network

/// What JS renders. Native owns every transition; JS only asks and shows.
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/sync/SyncCoordinator.kt `SyncStatus`
struct SyncStatus {
  let accountId: String?
  let pendingRows: Int
  let pause: SyncPauseReason?
  let lastUploadAtMs: Int64?

  func toMap() -> [String: Any?] {
    [
      "accountId": accountId,
      "pendingRows": pendingRows,
      "pause": pause?.slug,
      "lastUploadAtMs": lastUploadAtMs,
    ]
  }
}

/// The uploader's lifecycle: the loop, the kicks, and the Account binding it runs under.
///
/// Runs inside the window the app already keeps alive — the existing background modes during a ride,
/// the foreground otherwise. Deliberately no `BGTaskScheduler`: a ride that ends offline on a phone
/// that is never reopened waits for the next app open or the next ride.
///
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/sync/SyncCoordinator.kt
final class SyncCoordinator {
  static let shared = SyncCoordinator()

  internal static let syncPath = "/api/sync"

  /// Samples persisted this recently mean a ride is producing, Idle Pause included.
  private static let sampleActivityWindowMs: Int64 = 60_000

  /// A drain is a burst, not a loop that can never yield to the rest of the process.
  private static let maxDrainSteps = 50

  private let lock = NSLock()
  private var generation: Int64 = 0
  private var lastSamplePersistedAtMs: Int64 = 0
  private var lastUploadAtMs: Int64?
  private var wifiOnly = false
  private var onWifi = false
  private var online = true
  /// Failure keys already recorded this process, so a wedged batch writes one event, not a stream.
  private var recordedFailures = Set<String>()
  private var loop: Task<Void, Never>?
  /// Every pass chains onto this, so scan → send → commit never interleaves with another pass or
  /// with an Account reset. Cancelled by `stop()` together with the loop.
  private var chain: Task<Void, Never>?

  private let monitor = NWPathMonitor()
  private lazy var store = SyncStore(
    generation: { [weak self] in self?.currentGeneration() ?? 0 },
    onPermanentFailure: { [weak self] reason, detail in
      self?.recordPermanentFailure(reason, detail: detail)
    }
  )
  private lazy var engine = SyncEngine(
    source: store,
    transport: { [weak self] body in
      await self?.post(body) ?? .transient(reason: "stopped")
    },
    environment: { [weak self] in
      self?.environment() ?? SyncEnvironment(
        ridingSamples: false,
        online: false,
        wifiOnly: false,
        onWifi: false,
        credentialReady: false,
        onlineBlocked: true
      )
    }
  )

  private init() {
    monitor.pathUpdateHandler = { [weak self] path in
      guard let self else { return }
      let reachable = path.status == .satisfied
      self.lock.lock()
      let regained = reachable && !self.online
      self.online = reachable
      self.onWifi = path.usesInterfaceType(.wifi)
      self.lock.unlock()
      // Connectivity regained is one of the immediate kicks, next to ride end and sign-in.
      if regained { self.kick() }
    }
    monitor.start(queue: DispatchQueue(label: "app.vescape.sync.path"))
  }

  var pauseReason: SyncPauseReason? { engine.pauseReason }

  /// Recording persisted samples: the ride cadence follows sample production, not session presence.
  func notifySamplesPersisted(atMs: Int64 = telemetryNowMs()) {
    lock.lock()
    lastSamplePersistedAtMs = atMs
    lock.unlock()
  }

  func setWifiOnly(_ enabled: Bool) {
    lock.lock()
    wifiOnly = enabled
    lock.unlock()
    kick()
  }

  func status() -> SyncStatus {
    lock.lock()
    let uploadedAt = lastUploadAtMs
    lock.unlock()
    return SyncStatus(
      accountId: store.boundAccountId(),
      pendingRows: store.pendingCount(),
      pause: engine.pauseReason,
      lastUploadAtMs: uploadedAt
    )
  }

  /// Pick the uploader back up on a cold launch: the credential outlives the process, so a phone
  /// that was signed in stays signed in, and nothing else would ever start the loop again. Binding
  /// the stored Account is a no-op when this database already belongs to it, and cannot claim a
  /// database that belongs to another one.
  func resumeIfBound() {
    guard let credential = DeviceCredentialStore.shared.read() else { return }
    if bindAccount(credential.accountId) { start() }
  }

  func start() {
    guard loop == nil else { return }
    loop = Task { [weak self] in
      while !Task.isCancelled {
        guard let self else { return }
        let waitMs = await self.serialized { await self.pass() }
        try? await Task.sleep(nanoseconds: UInt64(max(waitMs, 0)) * 1_000_000)
      }
    }
  }

  /// Stops the loop and every pass in flight, so nothing is left running over a replaced database.
  func stop() {
    loop?.cancel()
    loop = nil
    chain?.cancel()
    chain = nil
  }

  /// Connectivity regained, ride ended, sign-in: send now rather than waiting for the next tick.
  func kick() {
    guard loop != nil else { return start() }
    Task { [weak self] in
      guard let self else { return }
      _ = await self.serialized { await self.pass() }
    }
  }

  /// Runs `work` after whatever is already queued, so a scan, its request and its cursor commit
  /// always complete against one database — an Account reset waits its turn rather than landing in
  /// the middle.
  private func serialized<T>(_ work: @escaping () async -> T) async -> T {
    lock.lock()
    let previous = chain
    let task = Task<T, Never> {
      await previous?.value
      return await work()
    }
    // The chain only has to say "the previous link finished", so its own value is discarded.
    chain = Task { _ = await task.value }
    lock.unlock()
    return await task.value
  }

  /// One pass, draining while the server keeps accepting: a `200` with rows still pending sends
  /// again straight away, so a long backlog drains instead of trickling.
  private func pass() async -> Int64 {
    var drains = 0
    while drains < Self.maxDrainSteps {
      switch await engine.runOnce() {
      case .sent(_, let morePending):
        lock.lock()
        lastUploadAtMs = telemetryNowMs()
        lock.unlock()
        if !morePending { return interval() }
        drains += 1
      // Nothing was accepted, but the next attempt differs — a narrowed byte target.
      case .retry:
        drains += 1
      case .waiting(let untilMs):
        return min(max(untilMs - telemetryNowMs(), 0), SyncPolicy.backoffMaxMs)
      case .paused:
        return SyncPolicy.idleIntervalMs
      case .idle:
        return interval()
      }
    }
    // A drain that never finishes yields rather than spinning; the next tick resumes it.
    return SyncPolicy.rideIntervalMs
  }

  private func interval() -> Int64 {
    samplesProducing() ? SyncPolicy.rideIntervalMs : SyncPolicy.idleIntervalMs
  }

  private func samplesProducing() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return telemetryNowMs() - lastSamplePersistedAtMs < Self.sampleActivityWindowMs
  }

  private func currentGeneration() -> Int64 {
    lock.lock()
    defer { lock.unlock() }
    return generation
  }

  private func environment() -> SyncEnvironment {
    lock.lock()
    let reachable = online
    let wifi = onWifi
    let meteredOnly = wifiOnly
    lock.unlock()
    let status = AppStatusCoordinator.shared.current?.version.status
    return SyncEnvironment(
      ridingSamples: samplesProducing(),
      online: reachable,
      wifiOnly: meteredOnly,
      onWifi: wifi,
      credentialReady: DeviceCredentialStore.shared.read() != nil,
      onlineBlocked: status == .onlineBlocked || status == .appBlocked
    )
  }

  /// The Sync endpoints are Online Capabilities behind the App Status gate, and they authenticate
  /// with the shared Device Token, so the whole call goes through `VescapeApi`.
  private func post(_ body: String) async -> SyncResponse {
    let api = VescapeApi.forOrigin(AppStatusCoordinator.serverBaseUrl)
    guard let response = await api.exchange(.post, path: Self.syncPath, rawBody: body) else {
      return .transient(reason: "network")
    }
    switch response.status {
    case 200: return .accepted(body: response.body)
    case 401: return .unauthorized
    case 413: return .tooLarge
    case 429: return .rateLimited(retryAfterMs: retryAfterMs(response.headers))
    case 500...599: return .transient(reason: "http \(response.status)")
    case 400...499: return .invalid(status: response.status, error: errorSlug(response.body))
    // A `2xx` that is not the accepted map is a protocol failure, not a success to interpret.
    default: return .invalid(status: response.status, error: "unexpected-success")
    }
  }

  /// The server's own delay in seconds, or the first backoff step when it named none.
  private func retryAfterMs(_ headers: [String: String]) -> Int64 {
    guard let value = headers["retry-after"], let seconds = Int64(value.trimmingCharacters(in: .whitespaces))
    else { return SyncPolicy.backoffStartMs }
    return seconds * 1_000
  }

  private func errorSlug(_ body: String) -> String {
    guard let data = body.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let error = json["error"] as? String, !error.isEmpty
    else { return "invalid-request" }
    return error
  }

  // Account binding — the Device Token exchange returns a stable server Account id, and the first
  // Account claims this database.

  /// Claim the local database for `accountId` when it is unbound or already belongs to it.
  ///
  /// False means a different Account: cursors are deliberately not reset over the existing rows,
  /// because that would upload the previous Account's Boards, Ride History, locations and settings
  /// to the new one. The Rider has to confirm the destructive reset first.
  @discardableResult
  func bindAccount(_ accountId: String) -> Bool {
    let bound = store.bindAccount(accountId)
    if bound {
      engine.resume()
      kick()
    }
    return bound
  }

  /// The Account change transition, in the one order that cannot leak data between Accounts: stop
  /// the loop, invalidate in-flight work, replace the database, clear cursors and pending actions,
  /// bind the new Account, then start again.
  ///
  /// The wipe is local maintenance and emits no Sync Actions to either Account — replacing the file
  /// removes the log with everything else.
  func resetForAccount(_ accountId: String) async throws {
    stop()
    // Queued behind any pass still in flight: one that started before `stop()` finishes its scan,
    // send and commit against the old database before the file is replaced, and none can start
    // midway through the transition.
    let outcome: Result<Void, Error> = await serialized { [self] in
      lock.lock()
      // Every in-flight response now belongs to a previous Account and can no longer commit.
      generation += 1
      recordedFailures.removeAll()
      lastUploadAtMs = nil
      lock.unlock()

      do {
        try TelemetryDatabase.replaceWithFreshDatabase()
        guard store.bindAccount(accountId) else {
          throw SyncStoreError.databaseUnavailable
        }
        engine.resume()
        return .success(())
      } catch {
        return .failure(error)
      }
    }
    try outcome.get()
    // Deliberately not started here: the caller installs the new Device Token first, so the loop
    // never runs with the previous Account's credential against the new Account's database.
  }

  /// One coalesced Diagnostic Event per failure class, table and cursor. Metadata only: an error
  /// code, a table, a cursor and the app version — never row contents, coordinates, the Device
  /// Token, the server body or an opaque database error.
  private func recordPermanentFailure(_ reason: SyncPauseReason, detail: String) {
    let key = "\(reason.slug):\(detail)"
    lock.lock()
    let isNew = recordedFailures.insert(key).inserted
    lock.unlock()
    guard isNew else { return }

    TelemetryRepository.shared.recordDiagnosticEvent(
      eventName: "sync_upload_paused",
      properties: [
        "operation": "sync",
        "phase": reason.slug,
        "message": "Sync upload paused",
        "sync_failure": reason.slug,
        "sync_detail": detail,
        "app_version": AppStatusCoordinator.installedMarketingVersion(),
      ]
    )
  }
}
