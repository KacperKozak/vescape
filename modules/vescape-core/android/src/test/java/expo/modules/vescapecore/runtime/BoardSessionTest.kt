package expo.modules.vescapecore.runtime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BoardSessionTest {

    @Test
    fun `new session is active`() {
        val session = BoardSession(id = 1)
        assertTrue(session.isActive)
        assertEquals(1L, session.id)
    }

    @Test
    fun `invalidate flips isActive to false`() {
        val session = BoardSession(id = 7)
        session.invalidate()
        assertFalse(session.isActive)
    }

    @Test
    fun `invalidate is idempotent`() {
        val session = BoardSession(id = 2)
        session.invalidate()
        session.invalidate()
        assertFalse(session.isActive)
    }
}
