import XCTest
@testable import VescBle

/// Config-safety rule boundaries: each rule fires with the right severity + payload, clears when the
/// setting is safe, per-cell rules skip (report nothing) when they cannot resolve their bound, and the
/// pushback voltage rules follow the firmware's per-cell (6.05+) vs pack units.
/// @parity /modules/vesc-ble/android/src/test/java/expo/modules/vescble/ConfigSafetyDetectorTest.kt
final class ConfigSafetyDetectorTests: XCTestCase {
  private func values(
    faultAdc1: Double? = 2.0,
    faultAdc2: Double? = 2.0,
    tiltbackLv: Double? = 45.0,
    tiltbackHv: Double? = 64.5,
    tiltbackDuty: Double? = 0.80,
    movingFaultDisabled: Bool? = false
  ) -> ConfigSafetyValues {
    ConfigSafetyValues(
      faultAdc1: faultAdc1,
      faultAdc2: faultAdc2,
      tiltbackLv: tiltbackLv,
      tiltbackHv: tiltbackHv,
      tiltbackDuty: tiltbackDuty,
      movingFaultDisabled: movingFaultDisabled
    )
  }

  private func finding(_ report: ConfigSafetyReport, _ kind: String) -> ConfigSafetyFinding? {
    report.findings.first { $0.kind == kind }
  }

  func testUsesPerCellVoltageResolvesFromFirmware() {
    XCTAssertEqual(ConfigSafetyDetector.usesPerCellVoltage("FW 6.05 · hw · cfg"), true)
    XCTAssertEqual(ConfigSafetyDetector.usesPerCellVoltage("FW 6.10"), true)
    XCTAssertEqual(ConfigSafetyDetector.usesPerCellVoltage("FW 7.00"), true)
    XCTAssertEqual(ConfigSafetyDetector.usesPerCellVoltage("FW 6.02"), false)
    XCTAssertEqual(ConfigSafetyDetector.usesPerCellVoltage("FW 5.03"), false)
    XCTAssertNil(ConfigSafetyDetector.usesPerCellVoltage(nil))
    XCTAssertNil(ConfigSafetyDetector.usesPerCellVoltage("unknown"))
  }

  func testAllSafeReportsEveryKindClean() {
    let report = ConfigSafetyDetector.evaluate(values(), seriesCount: 15, perCell: false)
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
    let report = ConfigSafetyDetector.evaluate(values(faultAdc1: 0.0, faultAdc2: 0.0), seriesCount: 15, perCell: false)
    let f = finding(report, ConfigSafetyDetector.kindFootpad)
    XCTAssertEqual(f?.severity, .critical)
    XCTAssertEqual(f?.payloadJson, "{\"param\":\"fault_adc1/fault_adc2\",\"value\":0.0000,\"bound\":0.0000}")
  }

  func testFootpadCleanWhenOneAdcNonZero() {
    let report = ConfigSafetyDetector.evaluate(values(faultAdc1: 0.0, faultAdc2: 2.0), seriesCount: 15, perCell: false)
    XCTAssertNil(finding(report, ConfigSafetyDetector.kindFootpad))
    XCTAssertTrue(report.cleanKinds.contains(ConfigSafetyDetector.kindFootpad))
  }

  func testFootpadSkippedWhenAdcFieldMissing() {
    let report = ConfigSafetyDetector.evaluate(values(faultAdc2: nil), seriesCount: 15, perCell: false)
    XCTAssertNil(finding(report, ConfigSafetyDetector.kindFootpad))
    XCTAssertFalse(report.cleanKinds.contains(ConfigSafetyDetector.kindFootpad))
  }

  func testLvPushbackLowFiresBelowPackMinimum() {
    // Pack mode, 15s: safe minimum 45.0 V; 44.0 is unsafe.
    let report = ConfigSafetyDetector.evaluate(values(tiltbackLv: 44.0), seriesCount: 15, perCell: false)
    let f = finding(report, ConfigSafetyDetector.kindLv)
    XCTAssertEqual(f?.severity, .critical)
    XCTAssertEqual(f?.payloadJson, "{\"param\":\"tiltback_lv\",\"value\":44.0000,\"bound\":45.0000}")
  }

  func testLvPushbackAtBoundIsClean() {
    let report = ConfigSafetyDetector.evaluate(values(), seriesCount: 15, perCell: false)
    XCTAssertNil(finding(report, ConfigSafetyDetector.kindLv))
    XCTAssertTrue(report.cleanKinds.contains(ConfigSafetyDetector.kindLv))
  }

  func testHvPushbackHighFiresAbovePackMaximum() {
    // Pack mode, 15s: safe maximum 64.5 V; 66.0 is unsafe.
    let report = ConfigSafetyDetector.evaluate(values(tiltbackHv: 66.0), seriesCount: 15, perCell: false)
    let f = finding(report, ConfigSafetyDetector.kindHv)
    XCTAssertEqual(f?.severity, .warn)
    XCTAssertEqual(f?.payloadJson, "{\"param\":\"tiltback_hv\",\"value\":66.0000,\"bound\":64.5000}")
  }

  func testPerCellFirmwareComparesRawVoltageWithoutSeries() {
    // Per-cell mode (6.05+): the bound is the per-cell constant directly; series count is irrelevant.
    let clean = ConfigSafetyDetector.evaluate(values(tiltbackLv: 3.0, tiltbackHv: 4.3), seriesCount: nil, perCell: true)
    XCTAssertTrue(clean.cleanKinds.contains(ConfigSafetyDetector.kindLv))
    XCTAssertTrue(clean.cleanKinds.contains(ConfigSafetyDetector.kindHv))

    let lvLow = ConfigSafetyDetector.evaluate(values(tiltbackLv: 2.9, tiltbackHv: 4.3), seriesCount: nil, perCell: true)
    let lv = finding(lvLow, ConfigSafetyDetector.kindLv)
    XCTAssertEqual(lv?.severity, .critical)
    XCTAssertEqual(lv?.payloadJson, "{\"param\":\"tiltback_lv\",\"value\":2.9000,\"bound\":3.0000}")

    let hvHigh = ConfigSafetyDetector.evaluate(values(tiltbackLv: 3.0, tiltbackHv: 4.5), seriesCount: nil, perCell: true)
    let hv = finding(hvHigh, ConfigSafetyDetector.kindHv)
    XCTAssertEqual(hv?.severity, .warn)
    XCTAssertEqual(hv?.payloadJson, "{\"param\":\"tiltback_hv\",\"value\":4.5000,\"bound\":4.3000}")
  }

  func testPerCellRulesSkippedWithoutSeriesCountInPackMode() {
    // Pack mode, dangerous LV/HV values, but no series count — the two rules must report nothing.
    let report = ConfigSafetyDetector.evaluate(values(tiltbackLv: 10.0, tiltbackHv: 90.0), seriesCount: nil, perCell: false)
    XCTAssertNil(finding(report, ConfigSafetyDetector.kindLv))
    XCTAssertNil(finding(report, ConfigSafetyDetector.kindHv))
    XCTAssertFalse(report.cleanKinds.contains(ConfigSafetyDetector.kindLv))
    XCTAssertFalse(report.cleanKinds.contains(ConfigSafetyDetector.kindHv))
    // The non-cell rules still evaluate.
    XCTAssertTrue(report.cleanKinds.contains(ConfigSafetyDetector.kindDuty))
  }

  func testVoltageRulesSkippedWhenFirmwareModeUnknown() {
    // perCell nil (unparseable firmware): units are ambiguous, so LV/HV report nothing even with series.
    let report = ConfigSafetyDetector.evaluate(values(tiltbackLv: 10.0, tiltbackHv: 90.0), seriesCount: 15, perCell: nil)
    XCTAssertNil(finding(report, ConfigSafetyDetector.kindLv))
    XCTAssertNil(finding(report, ConfigSafetyDetector.kindHv))
    XCTAssertFalse(report.cleanKinds.contains(ConfigSafetyDetector.kindLv))
    XCTAssertFalse(report.cleanKinds.contains(ConfigSafetyDetector.kindHv))
    XCTAssertTrue(report.cleanKinds.contains(ConfigSafetyDetector.kindDuty))
    XCTAssertTrue(report.cleanKinds.contains(ConfigSafetyDetector.kindMovingFault))
  }

  func testDutyPushbackHighFiresOverLimit() {
    let report = ConfigSafetyDetector.evaluate(values(tiltbackDuty: 0.90), seriesCount: 15, perCell: false)
    let f = finding(report, ConfigSafetyDetector.kindDuty)
    XCTAssertEqual(f?.severity, .warn)
    XCTAssertEqual(f?.payloadJson, "{\"param\":\"tiltback_duty\",\"value\":0.9000,\"bound\":0.8500}")
  }

  func testMovingFaultDisabledFiresWhenOn() {
    let report = ConfigSafetyDetector.evaluate(values(movingFaultDisabled: true), seriesCount: 15, perCell: false)
    let f = finding(report, ConfigSafetyDetector.kindMovingFault)
    XCTAssertEqual(f?.severity, .warn)
    XCTAssertEqual(f?.payloadJson, "{\"param\":\"fault_moving_fault_disabled\",\"value\":1.0000,\"bound\":0.0000}")
  }
}
