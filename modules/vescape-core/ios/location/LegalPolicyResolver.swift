import CoreLocation
import Foundation

internal struct LegalPolicySpeeds: Equatable {
  let warningSpeedKmh: Double
  let limitSpeedKmh: Double
}

/// Bundled Legal Policy lookup used by jurisdiction resolution and Legal Mode alert synthesis.
///
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/location/LegalPolicyCatalog.kt
internal final class LegalPolicyCatalog {
  private lazy var rows = Self.parse(json: Self.bundledJson())

  var countryCodes: Set<String> { Set(rows.keys) }

  func speeds(countryCode: String) -> LegalPolicySpeeds? {
    rows[countryCode.trimmingCharacters(in: .whitespaces).uppercased()]
  }

  static func parse(json: String) -> [String: LegalPolicySpeeds] {
    guard
      let data = json.data(using: .utf8),
      let values = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else { return [:] }

    var policies: [String: LegalPolicySpeeds] = [:]
    for value in values {
      guard let rawCode = value["code"] as? String else { continue }
      let code = rawCode.trimmingCharacters(in: .whitespaces).uppercased()
      guard code.count == 2 else { continue }
      let legal = number(value["legalSpeedKmh"])
      let reference = number(value["referenceSpeedKmh"])
      let limit = positive(legal) ?? positive(reference)
      let warning = positive(number(value["warningSpeedKmh"])) ?? limit.map { $0 - 5 }.flatMap(positive)
      guard let limit, let warning, warning < limit else { continue }
      policies[code] = LegalPolicySpeeds(warningSpeedKmh: warning, limitSpeedKmh: limit)
    }
    return policies
  }

  private static func number(_ value: Any?) -> Double? {
    (value as? NSNumber)?.doubleValue
  }

  private static func positive(_ value: Double?) -> Double? {
    guard let value, value.isFinite, value > 0 else { return nil }
    return value
  }

  private static func bundledJson() -> String {
    let moduleBundle = Bundle(for: LegalPolicyCatalog.self)
    let url =
      moduleBundle.url(forResource: "legal-policies", withExtension: "json")
      ?? moduleBundle.url(forResource: "VescapeCoreAssets", withExtension: "bundle").flatMap {
        Bundle(url: $0)?.url(forResource: "legal-policies", withExtension: "json")
      }
    return url.flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? "[]"
  }
}

/// Native OS reverse geocoder constrained by the bundled Legal Policy catalog.
///
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/location/LegalPolicyResolver.kt
internal final class LegalPolicyResolver {
  private let geocoder = CLGeocoder()
  private let catalog = LegalPolicyCatalog()

  func resolve(latitude: Double, longitude: Double) async -> String? {
    let placemarks = try? await geocoder.reverseGeocodeLocation(
      CLLocation(latitude: latitude, longitude: longitude)
    )
    return Self.normalizeCountryCode(placemarks?.first?.isoCountryCode, supported: catalog.countryCodes)
  }

  static func countryCodes(json: String) -> Set<String> {
    Set(LegalPolicyCatalog.parse(json: json).keys)
  }

  static func normalizeCountryCode(_ raw: String?, supported: Set<String>) -> String? {
    guard let code = raw?.trimmingCharacters(in: .whitespaces).uppercased() else { return nil }
    return supported.contains(code) ? code : nil
  }
}
