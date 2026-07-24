package expo.modules.vescapecore

import expo.modules.vescapecore.appstatus.AppStatusCoordinator
import okhttp3.Request

/**
 * Pure Online Capability gate decisions for the Group Ride observe socket. Kept free of `Handler`
 * and live sockets so the gating contract — refuse start/reconnect while blocked, tear down on a
 * block, resume when it clears, stamp the version header, recognize a server 426 — is unit-tested
 * without Android framework or network. [GroupRideObserver] wires these to okhttp/main-thread glue.
 *
 * @platform-diff Android-only: iOS Group Ride is an unsupported stub, so it has no online gate.
 */
internal object GroupRideOnlineGate {
  /** A fresh connect or a scheduled reconnect may proceed only while online work is permitted. */
  fun mayConnect(onlineBlocked: Boolean): Boolean = !onlineBlocked

  /** An active observe socket (or its reconnect work) must be torn down the moment a block arrives. */
  fun mustTearDown(onlineBlocked: Boolean, active: Boolean): Boolean = onlineBlocked && active

  /** After a status change clears the block, (re)connect if we are observing but have no socket. */
  fun shouldResume(onlineBlocked: Boolean, active: Boolean, connected: Boolean): Boolean =
    !onlineBlocked && active && !connected

  /** Whether a failed WebSocket upgrade was the server rejecting the app version (`426`). */
  fun isVersionRejection(httpCode: Int?): Boolean = httpCode == VERSION_REJECTION_CODE

  /**
   * Observe-socket upgrade request, stamped with the installed marketing version so the server can
   * resolve its Release Policy. A blank version (unreadable package info) omits the header rather
   * than sending an empty one — the server then treats the client version as unknown.
   */
  fun buildObserveRequest(url: String, appVersion: String): Request {
    val builder = Request.Builder().url(url)
    if (appVersion.isNotEmpty()) {
      builder.header(AppStatusCoordinator.APP_VERSION_HEADER, appVersion)
    }
    return builder.build()
  }

  /** HTTP 426 Upgrade Required — the server's release-block rejection of an app version. */
  const val VERSION_REJECTION_CODE = 426
}
