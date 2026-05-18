package expo.modules.vescble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RefloatConfigModelsTest {
  @Test
  fun allowlistContainsScreenshotGeneralFields() {
    val ids = REFLOAT_TUNE_GROUPS.flatMap { it.fields }.map { it.id }.toSet()
    assertTrue(ids.contains("kp"))
    assertTrue(ids.contains("kp2"))
    assertTrue(ids.contains("kp_brake"))
    assertTrue(ids.contains("kp2_brake"))
    assertTrue(ids.contains("ki"))
    assertTrue(ids.contains("ki_limit"))
    assertTrue(ids.contains("mahony_kp"))
    assertTrue(ids.contains("mahony_kp_roll"))
    assertTrue(ids.contains("atr_strength_up"))
    assertTrue(ids.contains("atr_strength_down"))
  }

  @Test
  fun snapshotMapUsesReadOnlyFields() {
    val snapshot = RefloatConfigSnapshot(
      capturedAt = 10L,
      boardId = "board-1",
      canId = 7,
      schemaHash = "schema",
      rawConfigHash = "raw",
      rawConfigLength = 4,
      groups = listOf(
        RefloatConfigGroup(
          id = "general",
          title = "General",
          fields = listOf(
            RefloatConfigField(
              id = "kp",
              label = "Angle P",
              value = 26.0,
              unit = null,
              min = 0.0,
              max = 100.0,
            ),
          ),
        ),
      ),
      missingFieldIds = emptyList(),
      fwVersion = null,
    )

    val group = (snapshot.toMap()["groups"] as List<*>).first() as Map<*, *>
    val field = (group["fields"] as List<*>).first() as Map<*, *>
  }
}
