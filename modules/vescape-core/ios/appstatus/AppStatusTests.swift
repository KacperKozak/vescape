import XCTest
@testable import VescapeCore

/// App Status wire contract: required shapes decode, unknown additive fields are ignored, and any
/// invalid required field degrades to `nil` so the caller treats it as a fetch failure.
/// @parity /modules/vescape-core/android/src/test/java/expo/modules/vescapecore/appstatus/AppStatusTest.kt
final class AppStatusTests: XCTestCase {
  private let currentVersion = #"{"installed":"0.80.2","latest":"0.80.2","status":"current"}"#

  private func body(_ version: String, messages: String = "[]") -> Data {
    Data(#"{"version":\#(version),"messages":\#(messages)}"#.utf8)
  }

  func testDecodesAResolvedUpdateWarning() {
    let status = decodeAppStatus(
      body(#"{"installed":"0.70.0","latest":"0.80.2","status":"update-warning","message":"**Update**"}"#)
    )

    XCTAssertEqual(status?.version.installed, "0.70.0")
    XCTAssertEqual(status?.version.latest, "0.80.2")
    XCTAssertEqual(status?.version.status, .updateWarning)
    XCTAssertEqual(status?.version.message, "**Update**")
    XCTAssertEqual(status?.messages, [CommunityMessage]())
  }

  func testDecodesEveryResolvedStatusSlug() {
    let slugs: [(String, AppVersionStatus)] = [
      ("current", .current),
      ("update-warning", .updateWarning),
      ("online-blocked", .onlineBlocked),
      ("app-blocked", .appBlocked),
    ]
    for (slug, expected) in slugs {
      let status = decodeAppStatus(body(#"{"installed":"0.1.0","latest":"0.80.2","status":"\#(slug)"}"#))
      XCTAssertEqual(status?.version.status, expected, slug)
    }
  }

  func testDecodesCommunityMessagesWithAndWithoutAnAction() {
    let status = decodeAppStatus(
      body(
        currentVersion,
        messages: """
        [
          {"id":"m1","type":"critical","body":"Relay down",
           "action":{"type":"primary","label":"Status","url":"https://vescape.app/status"}},
          {"id":"m2","type":"info","body":"Hello"}
        ]
        """
      )
    )

    XCTAssertEqual(status?.messages.count, 2)
    XCTAssertEqual(status?.messages.first?.type, .critical)
    XCTAssertEqual(status?.messages.first?.action?.type, .primary)
    XCTAssertEqual(status?.messages.first?.action?.url, "https://vescape.app/status")
    XCTAssertNil(status?.messages.last?.action)
  }

  func testIgnoresUnknownAdditiveFields() {
    let status = decodeAppStatus(
      Data(
        """
        {"version":{"installed":"0.80.2","latest":"0.80.2","status":"current","futureField":1},
         "messages":[{"id":"m1","type":"info","body":"Hi","futureField":true}],
         "futureSection":{"a":1}}
        """.utf8
      )
    )

    XCTAssertEqual(status?.version.status, .current)
    XCTAssertEqual(status?.messages.count, 1)
  }

  func testRejectsInvalidRequiredShapes() {
    let invalid: [Data] = [
      Data("not json".utf8),
      Data(#"{"messages":[]}"#.utf8),
      body(#"{"latest":"0.80.2","status":"current"}"#),
      body(#"{"installed":"0.80.2","status":"current"}"#),
      body(#"{"installed":"0.80.2","latest":"0.80.2"}"#),
      body(#"{"installed":"0.80.2","latest":"0.80.2","status":"retired"}"#),
      body(#"{"installed":"","latest":"0.80.2","status":"current"}"#),
      body(#"{"installed":1,"latest":"0.80.2","status":"current"}"#),
      body(#"{"installed":"0.80.2","latest":"0.80.2","status":"current","message":42}"#),
      Data(#"{"version":\#(currentVersion)}"#.utf8),
      body(currentVersion, messages: #"{"m1":"Hi"}"#),
      body(currentVersion, messages: #"[{"type":"info","body":"Hi"}]"#),
      body(currentVersion, messages: #"[{"id":"m1","type":"shout","body":"Hi"}]"#),
      body(currentVersion, messages: #"[{"id":"m1","type":"info","body":"Hi","action":{"type":"primary"}}]"#),
      body(
        currentVersion,
        messages: #"[{"id":"m1","type":"info","body":"Hi","action":{"type":"tertiary","label":"a","url":"b"}}]"#
      ),
    ]

    for json in invalid {
      XCTAssertNil(decodeAppStatus(json), String(decoding: json, as: UTF8.self))
    }
  }

  func testMapsTheBridgePayload() {
    let map = decodeAppStatus(
      body(
        #"{"installed":"0.70.0","latest":"0.80.2","status":"update-warning","message":"Update"}"#,
        messages: #"[{"id":"m1","type":"warning","body":"Hi","action":{"type":"secondary","label":"Read","url":"https://vescape.app"}}]"#
      )
    )?.toMap()

    let version = map?["version"] as? [String: Any?]
    XCTAssertEqual(version?["installed"] as? String, "0.70.0")
    XCTAssertEqual(version?["latest"] as? String, "0.80.2")
    XCTAssertEqual(version?["status"] as? String, "update-warning")
    XCTAssertEqual(version?["message"] as? String, "Update")

    let messages = map?["messages"] as? [[String: Any?]]
    XCTAssertEqual(messages?.count, 1)
    XCTAssertEqual(messages?.first?["id"] as? String, "m1")
    XCTAssertEqual(messages?.first?["type"] as? String, "warning")
    let action = messages?.first?["action"] as? [String: Any?]
    XCTAssertEqual(action?["type"] as? String, "secondary")
    XCTAssertEqual(action?["label"] as? String, "Read")
    XCTAssertEqual(action?["url"] as? String, "https://vescape.app")
  }
}
