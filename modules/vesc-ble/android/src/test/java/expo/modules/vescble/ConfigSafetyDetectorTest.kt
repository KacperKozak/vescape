package expo.modules.vescble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Config-safety rule boundaries: each rule fires with the right severity + payload, clears when the
 * setting is safe, per-cell rules skip (report nothing) when they cannot resolve their bound, and the
 * pushback voltage rules follow the firmware's per-cell (6.05+) vs pack units.
 * @parity /modules/vesc-ble/ios/ConfigSafetyDetectorTests.swift
 */
class ConfigSafetyDetectorTest {
  // Pack-voltage-mode safe config (older firmware): 15s → LV 45.0 V, HV 64.5 V.
  private val safe = ConfigSafetyValues(
    faultAdc1 = 2.0,
    faultAdc2 = 2.0,
    tiltbackLv = 45.0,
    tiltbackHv = 64.5,
    tiltbackDuty = 0.80,
    movingFaultDisabled = false,
  )

  // Per-cell-mode safe config (VESC 6.05+): LV 3.0 V, HV 4.3 V, series-independent.
  private val perCellSafe = safe.copy(tiltbackLv = 3.0, tiltbackHv = 4.3)

  private fun ConfigSafetyReport.finding(kind: String): ConfigSafetyFinding? =
    findings.firstOrNull { it.kind == kind }

  @Test
  fun usesPerCellVoltageResolvesFromFirmware() {
    assertEquals(true, ConfigSafetyDetector.usesPerCellVoltage("FW 6.05 · hw · cfg"))
    assertEquals(true, ConfigSafetyDetector.usesPerCellVoltage("FW 6.10"))
    assertEquals(true, ConfigSafetyDetector.usesPerCellVoltage("FW 7.00"))
    assertEquals(false, ConfigSafetyDetector.usesPerCellVoltage("FW 6.02"))
    assertEquals(false, ConfigSafetyDetector.usesPerCellVoltage("FW 5.03"))
    assertNull(ConfigSafetyDetector.usesPerCellVoltage(null))
    assertNull(ConfigSafetyDetector.usesPerCellVoltage("unknown"))
  }

  @Test
  fun allSafeReportsEveryKindClean() {
    val report = ConfigSafetyDetector.evaluate(safe, seriesCount = 15, perCell = false)
    assertTrue(report.findings.isEmpty())
    assertEquals(
      setOf(
        ConfigSafetyDetector.KIND_FOOTPAD,
        ConfigSafetyDetector.KIND_LV,
        ConfigSafetyDetector.KIND_HV,
        ConfigSafetyDetector.KIND_DUTY,
        ConfigSafetyDetector.KIND_MOVING_FAULT,
      ),
      report.cleanKinds.toSet(),
    )
  }

  @Test
  fun footpadDisabledWhenBothAdcZero() {
    val report = ConfigSafetyDetector.evaluate(safe.copy(faultAdc1 = 0.0, faultAdc2 = 0.0), seriesCount = 15, perCell = false)
    val finding = report.finding(ConfigSafetyDetector.KIND_FOOTPAD)!!
    assertEquals(ConfigRuleSeverity.CRITICAL, finding.severity)
    assertEquals("{\"param\":\"fault_adc1/fault_adc2\",\"value\":0.0000,\"bound\":0.0000}", finding.payloadJson)
  }

  @Test
  fun footpadCleanWhenOneAdcNonZero() {
    val report = ConfigSafetyDetector.evaluate(safe.copy(faultAdc1 = 0.0, faultAdc2 = 2.0), seriesCount = 15, perCell = false)
    assertNull(report.finding(ConfigSafetyDetector.KIND_FOOTPAD))
    assertTrue(report.cleanKinds.contains(ConfigSafetyDetector.KIND_FOOTPAD))
  }

  @Test
  fun footpadSkippedWhenAdcFieldMissing() {
    val report = ConfigSafetyDetector.evaluate(safe.copy(faultAdc2 = null), seriesCount = 15, perCell = false)
    assertNull(report.finding(ConfigSafetyDetector.KIND_FOOTPAD))
    assertTrue(!report.cleanKinds.contains(ConfigSafetyDetector.KIND_FOOTPAD))
  }

  @Test
  fun lvPushbackLowFiresBelowPackMinimum() {
    // Pack mode, 15s: safe minimum 45.0 V; 44.0 is unsafe.
    val report = ConfigSafetyDetector.evaluate(safe.copy(tiltbackLv = 44.0), seriesCount = 15, perCell = false)
    val finding = report.finding(ConfigSafetyDetector.KIND_LV)!!
    assertEquals(ConfigRuleSeverity.CRITICAL, finding.severity)
    assertEquals("{\"param\":\"tiltback_lv\",\"value\":44.0000,\"bound\":45.0000}", finding.payloadJson)
  }

  @Test
  fun lvPushbackAtBoundIsClean() {
    val report = ConfigSafetyDetector.evaluate(safe.copy(tiltbackLv = 45.0), seriesCount = 15, perCell = false)
    assertNull(report.finding(ConfigSafetyDetector.KIND_LV))
    assertTrue(report.cleanKinds.contains(ConfigSafetyDetector.KIND_LV))
  }

  @Test
  fun hvPushbackHighFiresAbovePackMaximum() {
    // Pack mode, 15s: safe maximum 64.5 V; 66.0 is unsafe.
    val report = ConfigSafetyDetector.evaluate(safe.copy(tiltbackHv = 66.0), seriesCount = 15, perCell = false)
    val finding = report.finding(ConfigSafetyDetector.KIND_HV)!!
    assertEquals(ConfigRuleSeverity.WARN, finding.severity)
    assertEquals("{\"param\":\"tiltback_hv\",\"value\":66.0000,\"bound\":64.5000}", finding.payloadJson)
  }

  @Test
  fun perCellFirmwareComparesRawVoltageWithoutSeries() {
    // Per-cell mode (6.05+): the bound is the per-cell constant directly; series count is irrelevant.
    val clean = ConfigSafetyDetector.evaluate(perCellSafe, seriesCount = null, perCell = true)
    assertTrue(clean.cleanKinds.contains(ConfigSafetyDetector.KIND_LV))
    assertTrue(clean.cleanKinds.contains(ConfigSafetyDetector.KIND_HV))

    val lvLow = ConfigSafetyDetector.evaluate(perCellSafe.copy(tiltbackLv = 2.9), seriesCount = null, perCell = true)
    val lv = lvLow.finding(ConfigSafetyDetector.KIND_LV)!!
    assertEquals(ConfigRuleSeverity.CRITICAL, lv.severity)
    assertEquals("{\"param\":\"tiltback_lv\",\"value\":2.9000,\"bound\":3.0000}", lv.payloadJson)

    val hvHigh = ConfigSafetyDetector.evaluate(perCellSafe.copy(tiltbackHv = 4.5), seriesCount = null, perCell = true)
    val hv = hvHigh.finding(ConfigSafetyDetector.KIND_HV)!!
    assertEquals(ConfigRuleSeverity.WARN, hv.severity)
    assertEquals("{\"param\":\"tiltback_hv\",\"value\":4.5000,\"bound\":4.3000}", hv.payloadJson)
  }

  @Test
  fun perCellRulesSkippedWithoutSeriesCountInPackMode() {
    // Pack mode, dangerous LV/HV values, but no series count — the two rules must report nothing.
    val report = ConfigSafetyDetector.evaluate(
      safe.copy(tiltbackLv = 10.0, tiltbackHv = 90.0),
      seriesCount = null,
      perCell = false,
    )
    assertNull(report.finding(ConfigSafetyDetector.KIND_LV))
    assertNull(report.finding(ConfigSafetyDetector.KIND_HV))
    assertTrue(!report.cleanKinds.contains(ConfigSafetyDetector.KIND_LV))
    assertTrue(!report.cleanKinds.contains(ConfigSafetyDetector.KIND_HV))
    // The non-cell rules still evaluate.
    assertTrue(report.cleanKinds.contains(ConfigSafetyDetector.KIND_DUTY))
  }

  @Test
  fun voltageRulesSkippedWhenFirmwareModeUnknown() {
    // perCell null (unparseable firmware): units are ambiguous, so LV/HV report nothing even with series.
    val report = ConfigSafetyDetector.evaluate(safe.copy(tiltbackLv = 10.0, tiltbackHv = 90.0), seriesCount = 15, perCell = null)
    assertNull(report.finding(ConfigSafetyDetector.KIND_LV))
    assertNull(report.finding(ConfigSafetyDetector.KIND_HV))
    assertTrue(!report.cleanKinds.contains(ConfigSafetyDetector.KIND_LV))
    assertTrue(!report.cleanKinds.contains(ConfigSafetyDetector.KIND_HV))
    // The firmware-agnostic rules still evaluate.
    assertTrue(report.cleanKinds.contains(ConfigSafetyDetector.KIND_DUTY))
    assertTrue(report.cleanKinds.contains(ConfigSafetyDetector.KIND_MOVING_FAULT))
  }

  @Test
  fun dutyPushbackHighFiresOverLimit() {
    val report = ConfigSafetyDetector.evaluate(safe.copy(tiltbackDuty = 0.90), seriesCount = 15, perCell = false)
    val finding = report.finding(ConfigSafetyDetector.KIND_DUTY)!!
    assertEquals(ConfigRuleSeverity.WARN, finding.severity)
    assertEquals("{\"param\":\"tiltback_duty\",\"value\":0.9000,\"bound\":0.8500}", finding.payloadJson)
  }

  @Test
  fun movingFaultDisabledFiresWhenOn() {
    val report = ConfigSafetyDetector.evaluate(safe.copy(movingFaultDisabled = true), seriesCount = 15, perCell = false)
    val finding = report.finding(ConfigSafetyDetector.KIND_MOVING_FAULT)!!
    assertEquals(ConfigRuleSeverity.WARN, finding.severity)
    assertEquals("{\"param\":\"fault_moving_fault_disabled\",\"value\":1.0000,\"bound\":0.0000}", finding.payloadJson)
  }
}
