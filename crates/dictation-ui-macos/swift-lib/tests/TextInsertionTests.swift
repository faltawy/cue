import Cocoa
import XCTest

@testable import swift_lib

final class TextInsertionTests: XCTestCase {
  func testPasteDestinationsDoNotNeedWritableAccessibilityText() {
    for role in ["AXTextArea", "AXTextField", "AXComboBox"] {
      XCTAssertTrue(
        acceptsDictationText(role: role, subrole: nil, isSettable: { _ in false }), role)
      XCTAssertFalse(
        acceptsDictationText(role: role, subrole: "AXSecureTextField", isSettable: { _ in true }),
        role)
    }
    XCTAssertFalse(acceptsDictationText(role: "AXButton", subrole: nil, isSettable: { _ in false }))
    XCTAssertTrue(
      acceptsDictationText(role: "AXGroup", subrole: nil, isSettable: { $0 == "AXSelectedText" }))
  }
}
