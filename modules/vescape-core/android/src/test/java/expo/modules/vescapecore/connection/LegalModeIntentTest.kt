package expo.modules.vescapecore.connection

import expo.modules.vescapecore.runtime.LinkIntegrity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LegalModeIntentTest {
    @Test
    fun enableRequiresMatchingConnectedBoardAndTrustedLink() {
        assertEquals(
            "LEGAL_MODE_BOARD_NOT_CONNECTED",
            legalModeEnableError(BoardPhase.Connected, "board-1", LinkIntegrity.Trusted, "board-2")?.first,
        )
        assertEquals(
            "LINK_NOT_TRUSTED",
            legalModeEnableError(BoardPhase.Connected, "board-1", LinkIntegrity.Checking, "board-1")?.first,
        )
        assertNull(
            legalModeEnableError(BoardPhase.Connected, "board-1", LinkIntegrity.Trusted, "board-1"),
        )
    }
}
