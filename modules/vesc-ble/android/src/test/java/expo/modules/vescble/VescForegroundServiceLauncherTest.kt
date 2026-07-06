package expo.modules.vescble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VescForegroundServiceLauncherTest {
    @Test
    fun `auto-connect disabled skips service start`() {
        assertEquals(
            ForegroundServiceLaunchSkipReason.AutoConnectDisabled,
            foregroundServiceLaunchSkipReason(
                ForegroundServiceLaunchPreflight(
                    action = ForegroundServiceStartAction.AutoConnectSelectedBoard,
                    autoConnectEnabled = false,
                    selectedBoardId = "board-1",
                ),
            ),
        )
    }

    @Test
    fun `auto-connect without selected board skips service start`() {
        assertEquals(
            ForegroundServiceLaunchSkipReason.SelectedBoardMissing,
            foregroundServiceLaunchSkipReason(
                ForegroundServiceLaunchPreflight(
                    action = ForegroundServiceStartAction.AutoConnectSelectedBoard,
                    selectedBoardId = null,
                ),
            ),
        )
    }

    @Test
    fun `connected-device action without bluetooth permission skips service start`() {
        assertEquals(
            ForegroundServiceLaunchSkipReason.BluetoothPermissionMissing,
            foregroundServiceLaunchSkipReason(
                ForegroundServiceLaunchPreflight(
                    action = ForegroundServiceStartAction.BoardSession,
                    bluetoothConnectGranted = false,
                ),
            ),
        )
    }

    @Test
    fun `gps action without location permission skips service start`() {
        assertEquals(
            ForegroundServiceLaunchSkipReason.LocationPermissionMissing,
            foregroundServiceLaunchSkipReason(
                ForegroundServiceLaunchPreflight(
                    action = ForegroundServiceStartAction.GpsMonitoring,
                    locationGranted = false,
                ),
            ),
        )
    }

    @Test
    fun `group ride observe does not require bluetooth or location permission`() {
        assertNull(
            foregroundServiceLaunchSkipReason(
                ForegroundServiceLaunchPreflight(
                    action = ForegroundServiceStartAction.GroupRideObserve,
                    bluetoothConnectGranted = false,
                    locationGranted = false,
                ),
            ),
        )
    }

    @Test
    fun `auto-connect with selected board and bluetooth permission can start`() {
        assertNull(
            foregroundServiceLaunchSkipReason(
                ForegroundServiceLaunchPreflight(
                    action = ForegroundServiceStartAction.AutoConnectSelectedBoard,
                    selectedBoardId = "board-1",
                ),
            ),
        )
    }
}
