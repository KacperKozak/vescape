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
