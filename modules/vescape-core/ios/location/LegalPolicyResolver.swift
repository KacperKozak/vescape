import CoreLocation
import Foundation

/// Native OS reverse geocoder constrained by the bundled Legal Policy catalog.
///
/// @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/location/LegalPolicyResolver.kt
internal final class LegalPolicyResolver {
  private let geocoder = CLGeocoder()
  private lazy var supportedCountryCodes = Self.bundledCountryCodes()

  func resolve(latitude: Double, longitude: Double) async -> String? {
    let placemarks = try? await geocoder.reverseGeocodeLocation(
      CLLocation(latitude: latitude, longitude: longitude)
    )
    return Self.normalizeCountryCode(placemarks?.first?.isoCountryCode, supported: supportedCountryCodes)
  }

  static func countryCodes(json: String) -> Set<String> {
    guard
      let data = json.data(using: .utf8),
      let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else { return [] }
    return Set(rows.compactMap { ($0["code"] as? String)?.trimmingCharacters(in: .whitespaces).uppercased() })
  }

  static func normalizeCountryCode(_ raw: String?, supported: Set<String>) -> String? {
    guard let code = raw?.trimmingCharacters(in: .whitespaces).uppercased() else { return nil }
    return supported.contains(code) ? code : nil
  }

  private static func bundledCountryCodes() -> Set<String> {
    let moduleBundle = Bundle(for: LegalPolicyResolver.self)
    let url =
      moduleBundle.url(forResource: "legal-policies", withExtension: "json")
      ?? moduleBundle.url(forResource: "VescapeCoreAssets", withExtension: "bundle").flatMap {
        Bundle(url: $0)?.url(forResource: "legal-policies", withExtension: "json")
      }
    guard let url, let json = try? String(contentsOf: url, encoding: .utf8) else { return [] }
    return countryCodes(json: json)
  }
}
