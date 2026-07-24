import XCTest
@testable import VescapeCore

final class LegalPolicyResolverTests: XCTestCase {
  func testCanonicalCatalogAcceptsSupportedCountriesAndRejectsUnsupportedCountries() throws {
    let root = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
    let json = try String(
      contentsOf: root.appendingPathComponent("shared/data/legal-policies.json"),
      encoding: .utf8
    )
    let supported = LegalPolicyResolver.countryCodes(json: json)

    XCTAssertEqual(LegalPolicyResolver.normalizeCountryCode("pl", supported: supported), "PL")
    XCTAssertNil(LegalPolicyResolver.normalizeCountryCode("US", supported: supported))
    XCTAssertNil(LegalPolicyResolver.normalizeCountryCode(nil, supported: supported))
  }

  func testDerivesWarningFromReferenceSpeedWhenJurisdictionHasNoLegalLimit() {
    let rows = LegalPolicyCatalog.parse(
      json: #"[{"code":"CY","legalSpeedKmh":null,"warningSpeedKmh":null,"referenceSpeedKmh":20}]"#
    )

    XCTAssertEqual(rows["CY"], LegalPolicySpeeds(warningSpeedKmh: 15, limitSpeedKmh: 20))
  }
}
