package expo.modules.vescble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Config-safety rule boundaries: each rule fires with the right severity + payload, clears when the
 * setting is safe, and per-cell rules skip (report nothing) when the series count is absent.
 * @parity /modules/vesc-ble/ios/ConfigSafetyDetectorTests.swift
 */
class ConfigSafetyDetectorTest {
  private val safe = ConfigSafetyValues(
    faultAdc1 = 2.0,
    faultAdc2 = 2.0,
    tiltbackLv = 45.0,
    tiltbackHv = 64.5,
    tiltbackDuty = 0.80,
    movingFaultDisabled = false,
  )

  private fun ConfigSafetyReport.finding(kind: String): ConfigSafetyFinding? =
    findings.firstOrNull { it.kind == kind }

  @Test
  fun allSafeReportsEveryKindClean() {
    val report = ConfigSafetyDetector.evaluate(safe, seriesCount = 15)
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
    val report = ConfigSafetyDetector.evaluate(safe.copy(faultAdc1 = 0.0, faultAdc2 = 0.0), seriesCount = 15)
    val finding = report.finding(ConfigSafetyDetector.KIND_FOOTPAD)!!
    assertEquals(ConfigRuleSeverity.CRITICAL, finding.severity)
    assertEquals("{\"param\":\"fault_adc1/fault_adc2\",\"value\":0.0000,\"bound\":0.0000}", finding.payloadJson)
  }

  @Test
  fun footpadCleanWhenOneAdcNonZero() {
    val report = ConfigSafetyDetector.evaluate(safe.copy(faultAdc1 = 0.0, faultAdc2 = 2.0), seriesCount = 15)
    assertEquals(null, report.finding(ConfigSafetyDetector.KIND_FOOTPAD))
    assertTrue(report.cleanKinds.contains(ConfigSafetyDetector.KIND_FOOTPAD))
  }

  @Test
  fun footpadSkippedWhenAdcFieldMissing() {
    val report = ConfigSafetyDetector.evaluate(safe.copy(faultAdc2 = null), seriesCount = 15)
    assertEquals(null, report.finding(ConfigSafetyDetector.KIND_FOOTPAD))
    assertTrue(!report.cleanKinds.contains(ConfigSafetyDetector.KIND_FOOTPAD))
  }

  @Test
  fun lvPushbackLowFiresBelowPerCellMinimum() {
    // 15s: safe minimum 45.0 V; 44.0 is unsafe.
    val report = ConfigSafetyDetector.evaluate(safe.copy(tiltbackLv = 44.0), seriesCount = 15)
    val finding = report.finding(ConfigSafetyDetector.KIND_LV)!!
    assertEquals(ConfigRuleSeverity.CRITICAL, finding.severity)
    assertEquals("{\"param\":\"tiltback_lv\",\"value\":44.0000,\"bound\":45.0000}", finding.payloadJson)
  }

  @Test
  fun lvPushbackAtBoundIsClean() {
    val report = ConfigSafetyDetector.evaluate(safe.copy(tiltbackLv = 45.0), seriesCount = 15)
    assertEquals(null, report.finding(ConfigSafetyDetector.KIND_LV))
    assertTrue(report.cleanKinds.contains(ConfigSafetyDetector.KIND_LV))
  }

  @Test
  fun hvPushbackHighFiresAbovePerCellMaximum() {
    // 15s: safe maximum 64.5 V; 66.0 is unsafe.
    val report = ConfigSafetyDetector.evaluate(safe.copy(tiltbackHv = 66.0), seriesCount = 15)
    val finding = report.finding(ConfigSafetyDetector.KIND_HV)!!
    assertEquals(ConfigRuleSeverity.WARN, finding.severity)
    assertEquals("{\"param\":\"tiltback_hv\",\"value\":66.0000,\"bound\":64.5000}", finding.payloadJson)
  }

  @Test
  fun perCellRulesSkippedWithoutSeriesCount() {
    // Dangerous LV/HV values, but no series count — the per-cell rules must report nothing at all.
    val report = ConfigSafetyDetector.evaluate(
      safe.copy(tiltbackLv = 10.0, tiltbackHv = 90.0),
      seriesCount = null,
    )
    assertEquals(null, report.finding(ConfigSafetyDetector.KIND_LV))
    assertEquals(null, report.finding(ConfigSafetyDetector.KIND_HV))
    assertTrue(!report.cleanKinds.contains(ConfigSafetyDetector.KIND_LV))
    assertTrue(!report.cleanKinds.contains(ConfigSafetyDetector.KIND_HV))
    // The non-cell rules still evaluate.
    assertTrue(report.cleanKinds.contains(ConfigSafetyDetector.KIND_DUTY))
  }

  @Test
  fun dutyPushbackHighFiresOverLimit() {
    val report = ConfigSafetyDetector.evaluate(safe.copy(tiltbackDuty = 0.90), seriesCount = 15)
    val finding = report.finding(ConfigSafetyDetector.KIND_DUTY)!!
    assertEquals(ConfigRuleSeverity.WARN, finding.severity)
    assertEquals("{\"param\":\"tiltback_duty\",\"value\":0.9000,\"bound\":0.8500}", finding.payloadJson)
  }

  @Test
  fun movingFaultDisabledFiresWhenOn() {
    val report = ConfigSafetyDetector.evaluate(safe.copy(movingFaultDisabled = true), seriesCount = 15)
    val finding = report.finding(ConfigSafetyDetector.KIND_MOVING_FAULT)!!
    assertEquals(ConfigRuleSeverity.WARN, finding.severity)
    assertEquals("{\"param\":\"fault_moving_fault_disabled\",\"value\":1.0000,\"bound\":0.0000}", finding.payloadJson)
  }
}
