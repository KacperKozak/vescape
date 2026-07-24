package expo.modules.vescapecore

import expo.modules.vescapecore.appstatus.AppVersionStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GroupRideOnlineGateTest {
  @Test
  fun `only online and app blocks deny online work`() {
    assertTrue(AppVersionStatus.ONLINE_BLOCKED.blocksOnline)
    assertTrue(AppVersionStatus.APP_BLOCKED.blocksOnline)
    assertFalse(AppVersionStatus.CURRENT.blocksOnline)
    assertFalse(AppVersionStatus.UPDATE_WARNING.blocksOnline)
  }

  @Test
  fun `connect is refused while blocked and allowed otherwise`() {
    assertFalse(GroupRideOnlineGate.mayConnect(onlineBlocked = true))
    assertTrue(GroupRideOnlineGate.mayConnect(onlineBlocked = false))
  }

  @Test
  fun `active socket tears down only when a block arrives`() {
    assertTrue(GroupRideOnlineGate.mustTearDown(onlineBlocked = true, active = true))
    // Not observing: nothing to tear down even if blocked.
    assertFalse(GroupRideOnlineGate.mustTearDown(onlineBlocked = true, active = false))
    // Observing but permitted: keep the socket.
    assertFalse(GroupRideOnlineGate.mustTearDown(onlineBlocked = false, active = true))
  }

  @Test
  fun `resume reconnects only when observing, unblocked, and socketless`() {
    assertTrue(GroupRideOnlineGate.shouldResume(onlineBlocked = false, active = true, connected = false))
    // Still blocked: stay down.
    assertFalse(GroupRideOnlineGate.shouldResume(onlineBlocked = true, active = true, connected = false))
    // Already connected: don't reconnect.
    assertFalse(GroupRideOnlineGate.shouldResume(onlineBlocked = false, active = true, connected = true))
    // Not observing: don't connect.
    assertFalse(GroupRideOnlineGate.shouldResume(onlineBlocked = false, active = false, connected = false))
  }

  @Test
  fun `only a 426 upgrade failure counts as a version rejection`() {
    assertTrue(GroupRideOnlineGate.isVersionRejection(426))
    assertFalse(GroupRideOnlineGate.isVersionRejection(401))
    assertFalse(GroupRideOnlineGate.isVersionRejection(null))
  }

  @Test
  fun `observe upgrade carries the installed version header`() {
    val request = GroupRideOnlineGate.buildObserveRequest("wss://relay.example/observe", "1.2.3")
    assertEquals("1.2.3", request.header("Vescape-App-Version"))
  }

  @Test
  fun `a blank version omits the header rather than sending an empty one`() {
    val request = GroupRideOnlineGate.buildObserveRequest("wss://relay.example/observe", "")
    assertNull(request.header("Vescape-App-Version"))
  }
}
