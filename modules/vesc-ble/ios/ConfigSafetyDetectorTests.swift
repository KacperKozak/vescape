import XCTest
@testable import VescBle

/// Config-safety rule boundaries: each rule fires with the right severity + payload, clears when the
/// setting is safe, and per-cell rules skip (report nothing) when the series count is absent.
/// @parity /modules/vesc-ble/android/src/test/java/expo/modules/vescble/ConfigSafetyDetectorTest.kt
final class ConfigSafetyDetectorTests: XCTestCase {
  private let safe = ConfigSafetyValues(
    faultAdc1: 2.0,
    faultAdc2: 2.0,
    tiltbackLv: 45.0,
    tiltbackHv: 64.5,
    tiltbackDuty: 0.80,
    movingFaultDisabled: false
  )

  private func finding(_ report: ConfigSafetyReport, _ kind: String) -> ConfigSafetyFinding? {
    report.findings.first { $0.kind == kind }
  }

  func testAllSafeReportsEveryKindClean() {
    let report = ConfigSafetyDetector.evaluate(safe, seriesCount: 15)
    XCTAssertTrue(report.findings.isEmpty)
    XCTAssertEqual(
      Set(report.cleanKinds),
      [
        ConfigSafetyDetector.kindFootpad,
        ConfigSafetyDetector.kindLv,
        ConfigSafetyDetector.kindHv,
        ConfigSafetyDetector.kindDuty,
        ConfigSafetyDetector.kindMovingFault,
      ]
    )
  }

  func testFootpadDisabledWhenBothAdcZero() {
    let values = ConfigSafetyValues(faultAdc1: 0.0, faultAdc2: 0.0, tiltbackLv: safe.tiltbackLv, tiltbackHv: safe.tiltbackHv, tiltbackDuty: safe.tiltbackDuty, movingFaultDisabled: safe.movingFaultDisabled)
    let report = ConfigSafetyDetector.evaluate(values, seriesCount: 15)
    let f = finding(report, ConfigSafetyDetector.kindFootpad)
    XCTAssertEqual(f?.severity, .critical)
    XCTAssertEqual(f?.payloadJson, "{\"param\":\"fault_adc1/fault_adc2\",\"value\":0.0000,\"bound\":0.0000}")
  }

  func testFootpadCleanWhenOneAdcNonZero() {
    let values = ConfigSafetyValues(faultAdc1: 0.0, faultAdc2: 2.0, tiltbackLv: safe.tiltbackLv, tiltbackHv: safe.tiltbackHv, tiltbackDuty: safe.tiltbackDuty, movingFaultDisabled: safe.movingFaultDisabled)
    let report = ConfigSafetyDetector.evaluate(values, seriesCount: 15)
    XCTAssertNil(finding(report, ConfigSafetyDetector.kindFootpad))
    XCTAssertTrue(report.cleanKinds.contains(ConfigSafetyDetector.kindFootpad))
  }

  func testFootpadSkippedWhenAdcFieldMissing() {
    let values = ConfigSafetyValues(faultAdc1: 2.0, faultAdc2: nil, tiltbackLv: safe.tiltbackLv, tiltbackHv: safe.tiltbackHv, tiltbackDuty: safe.tiltbackDuty, movingFaultDisabled: safe.movingFaultDisabled)
    let report = ConfigSafetyDetector.evaluate(values, seriesCount: 15)
    XCTAssertNil(finding(report, ConfigSafetyDetector.kindFootpad))
    XCTAssertFalse(report.cleanKinds.contains(ConfigSafetyDetector.kindFootpad))
  }

  func testLvPushbackLowFiresBelowPerCellMinimum() {
    // 15s: safe minimum 45.0 V; 44.0 is unsafe.
    let values = ConfigSafetyValues(faultAdc1: safe.faultAdc1, faultAdc2: safe.faultAdc2, tiltbackLv: 44.0, tiltbackHv: safe.tiltbackHv, tiltbackDuty: safe.tiltbackDuty, movingFaultDisabled: safe.movingFaultDisabled)
    let report = ConfigSafetyDetector.evaluate(values, seriesCount: 15)
    let f = finding(report, ConfigSafetyDetector.kindLv)
    XCTAssertEqual(f?.severity, .critical)
    XCTAssertEqual(f?.payloadJson, "{\"param\":\"tiltback_lv\",\"value\":44.0000,\"bound\":45.0000}")
  }

  func testLvPushbackAtBoundIsClean() {
    let report = ConfigSafetyDetector.evaluate(safe, seriesCount: 15)
    XCTAssertNil(finding(report, ConfigSafetyDetector.kindLv))
    XCTAssertTrue(report.cleanKinds.contains(ConfigSafetyDetector.kindLv))
  }

  func testHvPushbackHighFiresAbovePerCellMaximum() {
    // 15s: safe maximum 64.5 V; 66.0 is unsafe.
    let values = ConfigSafetyValues(faultAdc1: safe.faultAdc1, faultAdc2: safe.faultAdc2, tiltbackLv: safe.tiltbackLv, tiltbackHv: 66.0, tiltbackDuty: safe.tiltbackDuty, movingFaultDisabled: safe.movingFaultDisabled)
    let report = ConfigSafetyDetector.evaluate(values, seriesCount: 15)
    let f = finding(report, ConfigSafetyDetector.kindHv)
    XCTAssertEqual(f?.severity, .warn)
    XCTAssertEqual(f?.payloadJson, "{\"param\":\"tiltback_hv\",\"value\":66.0000,\"bound\":64.5000}")
  }

  func testPerCellRulesSkippedWithoutSeriesCount() {
    // Dangerous LV/HV values, but no series count — the per-cell rules must report nothing at all.
    let values = ConfigSafetyValues(faultAdc1: safe.faultAdc1, faultAdc2: safe.faultAdc2, tiltbackLv: 10.0, tiltbackHv: 90.0, tiltbackDuty: safe.tiltbackDuty, movingFaultDisabled: safe.movingFaultDisabled)
    let report = ConfigSafetyDetector.evaluate(values, seriesCount: nil)
    XCTAssertNil(finding(report, ConfigSafetyDetector.kindLv))
    XCTAssertNil(finding(report, ConfigSafetyDetector.kindHv))
    XCTAssertFalse(report.cleanKinds.contains(ConfigSafetyDetector.kindLv))
    XCTAssertFalse(report.cleanKinds.contains(ConfigSafetyDetector.kindHv))
    // The non-cell rules still evaluate.
    XCTAssertTrue(report.cleanKinds.contains(ConfigSafetyDetector.kindDuty))
  }

  func testDutyPushbackHighFiresOverLimit() {
    let values = ConfigSafetyValues(faultAdc1: safe.faultAdc1, faultAdc2: safe.faultAdc2, tiltbackLv: safe.tiltbackLv, tiltbackHv: safe.tiltbackHv, tiltbackDuty: 0.90, movingFaultDisabled: safe.movingFaultDisabled)
    let report = ConfigSafetyDetector.evaluate(values, seriesCount: 15)
    let f = finding(report, ConfigSafetyDetector.kindDuty)
    XCTAssertEqual(f?.severity, .warn)
    XCTAssertEqual(f?.payloadJson, "{\"param\":\"tiltback_duty\",\"value\":0.9000,\"bound\":0.8500}")
  }

  func testMovingFaultDisabledFiresWhenOn() {
    let values = ConfigSafetyValues(faultAdc1: safe.faultAdc1, faultAdc2: safe.faultAdc2, tiltbackLv: safe.tiltbackLv, tiltbackHv: safe.tiltbackHv, tiltbackDuty: safe.tiltbackDuty, movingFaultDisabled: true)
    let report = ConfigSafetyDetector.evaluate(values, seriesCount: 15)
    let f = finding(report, ConfigSafetyDetector.kindMovingFault)
    XCTAssertEqual(f?.severity, .warn)
    XCTAssertEqual(f?.payloadJson, "{\"param\":\"fault_moving_fault_disabled\",\"value\":1.0000,\"bound\":0.0000}")
  }
}
