import Cocoa
import XCTest

@testable import swift_lib

@MainActor
final class IslandSharingTests: XCTestCase {
  override func setUp() async throws {
    _ = NSApplication.shared
    FloatingBarManager.shared.presentsOnScreen = false
  }

  override func tearDown() async throws {
    FloatingOverlaySettingsModel.shared.applyVisibleInScreenshots(true)
    FloatingBarManager.shared.hide()
    try await Task.sleep(nanoseconds: 50_000_000)
  }

  func testIslandShowsInScreenshotsUnlessTheSettingIsOff() throws {
    let settings = FloatingOverlaySettingsModel.shared
    settings.apply(floatingBarState: state(visibleInScreenshots: nil))
    XCTAssertTrue(settings.visibleInScreenshots, "visible when the setting was never saved")

    FloatingBarManager.shared.show()
    XCTAssertEqual(FloatingBarManager.shared.panelSharingType, .readOnly)

    settings.apply(floatingBarState: state(visibleInScreenshots: false))
    RunLoop.main.run(until: Date().addingTimeInterval(0.05))
    XCTAssertEqual(FloatingBarManager.shared.panelSharingType, NSWindow.SharingType.none)

    settings.apply(floatingBarState: state(visibleInScreenshots: true))
    RunLoop.main.run(until: Date().addingTimeInterval(0.05))
    XCTAssertEqual(FloatingBarManager.shared.panelSharingType, .readOnly)
  }

  func testAnIslandOpenedWithTheSettingOffStartsHidden() throws {
    FloatingOverlaySettingsModel.shared.apply(floatingBarState: state(visibleInScreenshots: false))
    FloatingBarManager.shared.show()
    XCTAssertEqual(FloatingBarManager.shared.panelSharingType, NSWindow.SharingType.none)
  }

  func testLocalChangeIsNotUndoneByAStaleStateFromTheApp() {
    let settings = FloatingOverlaySettingsModel.shared
    settings.setVisibleInScreenshots(false)
    settings.apply(floatingBarState: state(visibleInScreenshots: true))
    XCTAssertFalse(settings.visibleInScreenshots, "the app hasn't seen the change yet")
    settings.apply(floatingBarState: state(visibleInScreenshots: false))
    settings.apply(floatingBarState: state(visibleInScreenshots: true))
    XCTAssertTrue(settings.visibleInScreenshots, "once confirmed, the app's value wins again")
  }

  private func state(visibleInScreenshots: Bool?) -> FloatingBarStatePayload {
    var state = FloatingBarStatePayload(
      dictation: nil, amplitude: 0, title: "Meeting", status: .recording, colorScheme: .dark,
      opacity: 0.8, liveCaptionOpacity: 0.85, liveCaptionWidth: 440, liveCaptionLineCount: 2,
      liveCaptionPosition: .topCenter, liveCaptionMinimized: false, liveCaptionToggleVisible: true,
      transcriptBubbles: nil)
    state.visibleInScreenshots = visibleInScreenshots
    return state
  }
}
