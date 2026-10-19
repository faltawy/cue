import Cocoa
import XCTest

@testable import swift_lib

final class IslandLayoutTests: XCTestCase {
  private let notched = IslandScreen(
    frame: NSRect(x: 0, y: 0, width: 1512, height: 982),
    visibleFrame: NSRect(x: 0, y: 0, width: 1512, height: 950),
    safeAreaTop: 32, auxiliaryTopLeftWidth: 656, auxiliaryTopRightWidth: 656)

  private let external = IslandScreen(
    frame: NSRect(x: 1512, y: 0, width: 2560, height: 1440),
    visibleFrame: NSRect(x: 1512, y: 0, width: 2560, height: 1415),
    safeAreaTop: 0, auxiliaryTopLeftWidth: nil, auxiliaryTopRightWidth: nil)

  func testNotchIsMeasuredBetweenTheMenuBarAreas() {
    XCTAssertTrue(notched.hasNotch)
    XCTAssertEqual(notched.notchWidth, 200)
    XCTAssertEqual(notched.notchHeight, 32)
    XCTAssertFalse(external.hasNotch)
    XCTAssertEqual(external.notchHeight, 0)
  }

  func testCollapsedIslandHugsTheTopEdgeCentredOnTheNotch() {
    let placement = IslandPlacement(screen: notched)
    let size = IslandLayout.size(for: .collapsed, placement, dictation: false)
    let frame = IslandLayout.frame(for: size, placement)
    XCTAssertEqual(size.height, 32, "same height as the camera housing")
    XCTAssertEqual(size.width, 200 + 80 * 2 + 8 * 2)
    XCTAssertEqual(frame.maxY, 982, "flush with the top edge")
    XCTAssertEqual(frame.midX, 756, "centred under the camera")
  }

  func testCaptionsHangUnderTheNotchAndStayCentred() {
    let placement = IslandPlacement(screen: notched, captionWidth: 440, captionLines: 2)
    let collapsed = IslandLayout.frame(
      for: IslandLayout.size(for: .collapsed, placement, dictation: false), placement)
    let captions = IslandLayout.frame(
      for: IslandLayout.size(for: .captions, placement, dictation: false), placement)
    XCTAssertEqual(captions.maxY, collapsed.maxY)
    XCTAssertEqual(captions.midX, collapsed.midX)
    XCTAssertEqual(captions.width, 440)
    XCTAssertEqual(captions.height, 32 + 10 + 2 * 22 + 12)
  }

  func testOnlyTheNarrowNeckEntersTheMenuBarWhateverTheCaptionWidth() {
    let notchLeft: CGFloat = 656
    let notchRight: CGFloat = 856
    let menuBarBottom = notched.frame.maxY - notched.notchHeight
    for width: CGFloat in [260, 440, 640] {
      let placement = IslandPlacement(screen: notched, captionWidth: width, captionLines: 4)
      for mode: IslandMode in [.collapsed, .captions, .peek] {
        let frame = IslandLayout.frame(
          for: IslandLayout.size(for: mode, placement, dictation: false), placement)
        let neck = IslandLayout.neckFrame(in: frame, placement)
        XCTAssertEqual(neck.minX, notchLeft - 80 - 8, "\(mode) at \(width)")
        XCTAssertEqual(neck.maxX, notchRight + 80 + 8, "\(mode) at \(width)")
        XCTAssertEqual(neck.minY, menuBarBottom, "\(mode) at \(width)")
        XCTAssertEqual(neck.maxY, notched.frame.maxY, "\(mode) at \(width)")
      }
    }
    let wide = IslandPlacement(screen: notched, captionWidth: 640)
    let captions = IslandLayout.frame(
      for: IslandLayout.size(for: .captions, wide, dictation: false), wide)
    XCTAssertEqual(captions.width, 640, "the caption panel below the menu bar is wider than the neck")
    XCTAssertEqual(
      IslandLayout.bodySize(for: .captions, wide, dictation: false).height,
      captions.height - notched.notchHeight, "everything wider than the neck sits below the menu bar")
  }

  func testWithoutANotchTheNeckIsThePillAndThePanelHangsBelowIt() {
    let placement = IslandPlacement(screen: external, captionWidth: 640)
    let frame = IslandLayout.frame(
      for: IslandLayout.size(for: .peek, placement, dictation: false), placement)
    let neck = IslandLayout.neckFrame(in: frame, placement)
    XCTAssertEqual(frame.width, 640)
    XCTAssertEqual(neck.size, NSSize(width: 176, height: 32))
    XCTAssertEqual(neck.midX, external.visibleFrame.midX)
    XCTAssertEqual(neck.maxY, frame.maxY)
    XCTAssertLessThan(neck.maxY, external.visibleFrame.maxY, "below the menu bar")

    let bottom = IslandPlacement(screen: external, position: .bottomCenter, captionWidth: 640)
    let bottomFrame = IslandLayout.frame(
      for: IslandLayout.size(for: .captions, bottom, dictation: false), bottom)
    XCTAssertEqual(IslandLayout.neckFrame(in: bottomFrame, bottom).minY, bottomFrame.minY)
  }

  func testMoreCaptionLinesMakeATallerPanelUpToTheLimit() {
    let two = IslandLayout.size(
      for: .captions, IslandPlacement(screen: notched, captionLines: 2), dictation: false)
    let four = IslandLayout.size(
      for: .captions, IslandPlacement(screen: notched, captionLines: 4), dictation: false)
    let tooMany = IslandLayout.size(
      for: .captions, IslandPlacement(screen: notched, captionLines: 9), dictation: false)
    XCTAssertEqual(four.height - two.height, 44)
    XCTAssertEqual(tooMany, four)
  }

  func testWithoutANotchTheIslandIsAPillBelowTheMenuBar() {
    let placement = IslandPlacement(screen: external)
    let frame = IslandLayout.frame(
      for: IslandLayout.size(for: .collapsed, placement, dictation: false), placement)
    XCTAssertFalse(placement.usesNotch)
    XCTAssertEqual(frame.size, NSSize(width: 176, height: 32))
    XCTAssertEqual(frame.midX, external.visibleFrame.midX)
    XCTAssertLessThan(frame.maxY, external.visibleFrame.maxY)
    XCTAssertGreaterThan(frame.maxY, external.visibleFrame.maxY - 10)
  }

  func testOnlyTheTopCentrePositionUsesTheNotch() {
    XCTAssertTrue(IslandPlacement(screen: notched, position: .topCenter).usesNotch)
    XCTAssertFalse(IslandPlacement(screen: notched, position: .topLeft).usesNotch)
    let bottom = IslandPlacement(screen: notched, position: .bottomRight)
    let frame = IslandLayout.frame(
      for: IslandLayout.size(for: .captions, bottom, dictation: false), bottom)
    XCTAssertTrue(bottom.anchorsBottom)
    XCTAssertEqual(frame.minY, notched.visibleFrame.minY + IslandLayout.screenMargin)
    XCTAssertEqual(frame.maxX, notched.visibleFrame.maxX - IslandLayout.screenMargin)
  }

  func testExpandedIslandGrowsDownwardWithoutMovingItsTopOrCentre() {
    let placement = IslandPlacement(screen: notched)
    let collapsed = IslandLayout.frame(
      for: IslandLayout.size(for: .collapsed, placement, dictation: false), placement)
    let peek = IslandLayout.frame(
      for: IslandLayout.size(for: .peek, placement, dictation: false), placement)
    XCTAssertEqual(peek.maxY, collapsed.maxY)
    XCTAssertEqual(peek.midX, collapsed.midX)
    XCTAssertGreaterThan(peek.height, collapsed.height + IslandLayout.controlsHeight)
    let dictation = IslandLayout.size(for: .peek, placement, dictation: true)
    XCTAssertEqual(dictation.height, 32 + IslandLayout.controlsHeight)
  }

  func testIslandSitsUnderTheCameraEvenWhenThePointerIsOnAnotherScreen() {
    XCTAssertEqual(IslandLayout.screenIndex(for: [external, notched], mouse: NSPoint(x: 2000, y: 500)), 1)
    XCTAssertEqual(IslandLayout.screenIndex(for: [notched, external], mouse: NSPoint(x: 2000, y: 500)), 0)
  }

  func testFollowMyPointerUsesTheScreenUnderThePointerThenTheMainOne() {
    let laptopWithoutNotch = IslandScreen(
      frame: NSRect(x: 0, y: 0, width: 1512, height: 982),
      visibleFrame: NSRect(x: 0, y: 0, width: 1512, height: 958))
    let screens = [external, laptopWithoutNotch]
    XCTAssertEqual(
      IslandLayout.screenIndex(for: screens, mouse: NSPoint(x: 100, y: 100), choice: .pointer), 1)
    XCTAssertEqual(
      IslandLayout.screenIndex(for: screens, mouse: NSPoint(x: -5000, y: 0), choice: .pointer), 0)
    XCTAssertEqual(
      IslandLayout.screenIndex(
        for: [notchedWithId, externalWithId], mouse: NSPoint(x: 2000, y: 500), choice: .pointer), 1)
    XCTAssertNil(IslandLayout.screenIndex(for: [], mouse: .zero, choice: .pointer))
  }

  func testWithoutANotchTheCameraChoiceFallsBackToTheMainDisplay() {
    let laptopWithoutNotch = IslandScreen(
      frame: NSRect(x: 0, y: 0, width: 1512, height: 982),
      visibleFrame: NSRect(x: 0, y: 0, width: 1512, height: 958))
    XCTAssertEqual(
      IslandLayout.screenIndex(for: [external, laptopWithoutNotch], mouse: NSPoint(x: 100, y: 100)),
      0)
  }

  // MARK: - Moving the island between displays

  private let notchedWithId = IslandScreen(
    frame: NSRect(x: 0, y: 0, width: 1512, height: 982),
    visibleFrame: NSRect(x: 0, y: 0, width: 1512, height: 950),
    safeAreaTop: 32, auxiliaryTopLeftWidth: 656, auxiliaryTopRightWidth: 656,
    id: "BUILTIN-UUID", name: "Built-in Retina Display")

  private let externalWithId = IslandScreen(
    frame: NSRect(x: 1512, y: 0, width: 2560, height: 1440),
    visibleFrame: NSRect(x: 1512, y: 0, width: 2560, height: 1415),
    safeAreaTop: 0, auxiliaryTopLeftWidth: nil, auxiliaryTopRightWidth: nil,
    id: "MI-UUID", name: "Mi Monitor")

  func testAChosenDisplayWinsOverTheCameraWhenItIsConnected() {
    let screens = [notchedWithId, externalWithId]
    XCTAssertEqual(
      IslandLayout.screenIndex(for: screens, mouse: .zero, choice: .display("MI-UUID")), 1)
    XCTAssertEqual(
      IslandLayout.screenIndex(for: screens.reversed(), mouse: .zero, choice: .display("MI-UUID")),
      0)
  }

  func testAMissingChosenDisplayFallsBackToTheCameraThenTheMainDisplay() {
    XCTAssertEqual(
      IslandLayout.screenIndex(
        for: [externalWithId, notchedWithId], mouse: .zero, choice: .display("GONE")), 1)
    let other = IslandScreen(
      frame: NSRect(x: -1920, y: 0, width: 1920, height: 1080),
      visibleFrame: NSRect(x: -1920, y: 0, width: 1920, height: 1055), id: "OTHER")
    XCTAssertEqual(
      IslandLayout.screenIndex(
        for: [externalWithId, other], mouse: .zero, choice: .display("GONE")), 0)
  }

  func testTheDisplayChoiceRoundTripsThroughItsSetting() {
    for choice in [IslandDisplayChoice.camera, .pointer, .display("MI-UUID")] {
      XCTAssertEqual(IslandDisplayChoice(setting: choice.setting), choice)
    }
    XCTAssertEqual(IslandDisplayChoice(setting: nil), .camera)
    XCTAssertEqual(IslandDisplayChoice(setting: ""), .camera)
  }

  func testAShortPressIsAClickAndOnlyLongerTravelIsADrag() {
    let start = NSPoint(x: 100, y: 100)
    XCTAssertFalse(IslandLayout.isDrag(from: start, to: NSPoint(x: 103, y: 101)))
    XCTAssertTrue(IslandLayout.isDrag(from: start, to: NSPoint(x: 104, y: 100)))
    XCTAssertTrue(IslandLayout.isDrag(from: start, to: NSPoint(x: 100, y: 90)))
  }

  func testReleasingSnapsToTheNearestAnchorOfTheDisplayUnderThePointer() {
    let screens = [notchedWithId, externalWithId]
    let cases: [(NSPoint, IslandSnap)] = [
      (NSPoint(x: 760, y: 930), IslandSnap(screenIndex: 0, position: .topCenter)),
      (NSPoint(x: 40, y: 900), IslandSnap(screenIndex: 0, position: .topLeft)),
      (NSPoint(x: 1490, y: 30), IslandSnap(screenIndex: 0, position: .bottomRight)),
      (NSPoint(x: 2792, y: 1300), IslandSnap(screenIndex: 1, position: .topCenter)),
      (NSPoint(x: 2792, y: 120), IslandSnap(screenIndex: 1, position: .bottomCenter)),
      (NSPoint(x: 4000, y: 1400), IslandSnap(screenIndex: 1, position: .topRight)),
    ]
    for (release, expected) in cases {
      XCTAssertEqual(IslandLayout.snapTarget(release: release, screens: screens), expected, "\(release)")
    }
  }

  func testReleasingOffEveryDisplaySnapsToTheNearestOne() {
    let screens = [notchedWithId, externalWithId]
    XCTAssertEqual(
      IslandLayout.snapTarget(release: NSPoint(x: 5000, y: 1500), screens: screens)?.screenIndex, 1)
    XCTAssertEqual(
      IslandLayout.snapTarget(release: NSPoint(x: -300, y: 500), screens: screens)?.screenIndex, 0)
    XCTAssertNil(IslandLayout.snapTarget(release: .zero, screens: []))
  }

  func testTheDraggedPillKeepsTheGrabbedPointUnderThePointer() {
    let frame = IslandLayout.dragFrame(
      pointer: NSPoint(x: 500, y: 400), grabOffset: NSPoint(x: 30, y: 10))
    XCTAssertEqual(frame.origin, NSPoint(x: 470, y: 390))
    XCTAssertEqual(frame.size, NSSize(width: IslandLayout.pillWidth, height: IslandLayout.pillHeight))
  }

  func testAReleasedIslandSettlesIntoTheNeckOfItsNewPlacement() {
    let underCamera = IslandPlacement(screen: notchedWithId)
    let neck = IslandLayout.settleFrame(underCamera)
    XCTAssertEqual(neck.midX, 756)
    XCTAssertEqual(neck.maxY, 982)
    XCTAssertEqual(neck.height, 32)
    let corner = IslandPlacement(screen: externalWithId, position: .bottomLeft)
    let pill = IslandLayout.settleFrame(corner)
    XCTAssertEqual(pill.size, NSSize(width: IslandLayout.pillWidth, height: IslandLayout.pillHeight))
    XCTAssertEqual(pill.minY, externalWithId.visibleFrame.minY + IslandLayout.screenMargin)
  }

  // MARK: - Bottom centre, the default

  func testTheIslandFloatsAtTheBottomCentreByDefault() {
    XCTAssertEqual(FloatingOverlaySettingsModel.shared.liveCaptionPosition, .bottomCenter)
  }

  func testAtTheBottomTheIslandSitsAboveTheDockCentredAndGrowsUpward() {
    let withDock = IslandScreen(
      frame: NSRect(x: 0, y: 0, width: 1512, height: 982),
      visibleFrame: NSRect(x: 0, y: 72, width: 1512, height: 878),
      safeAreaTop: 32, auxiliaryTopLeftWidth: 656, auxiliaryTopRightWidth: 656)
    let placement = IslandPlacement(
      screen: withDock, position: .bottomCenter, captionWidth: 440, captionLines: 2)
    XCTAssertFalse(placement.usesNotch, "no neck at the bottom, even on a notched display")
    let panel = IslandLayout.panelFrame(placement)
    var previousTop: CGFloat = 0
    for mode: IslandMode in [.collapsed, .captions, .peek] {
      let island = IslandLayout.islandFrame(for: mode, placement, dictation: false, in: panel)
      XCTAssertEqual(island.minY, 72 + IslandLayout.screenMargin, "\(mode): bottom edge pinned")
      XCTAssertGreaterThanOrEqual(island.minY, withDock.visibleFrame.minY, "\(mode): clear of the Dock")
      XCTAssertEqual(island.midX, 756, "\(mode): centred")
      XCTAssertGreaterThan(island.maxY, previousTop, "\(mode): grows upward")
      previousTop = island.maxY
    }
    let hiddenDock = IslandScreen(
      frame: withDock.frame, visibleFrame: NSRect(x: 0, y: 4, width: 1512, height: 946))
    let lower = IslandLayout.panelFrame(IslandPlacement(screen: hiddenDock, position: .bottomCenter))
    XCTAssertEqual(lower.minY + IslandLayout.shadowMargin, 4 + IslandLayout.screenMargin,
      "follows the Dock when it auto-hides")
  }

  func testAtTheBottomTheWholePanelTakesClicksAndOnlyItsTitleRowMovesIt() {
    let placement = IslandPlacement(
      screen: external, position: .bottomCenter, captionWidth: 440, captionLines: 2)
    let panel = IslandLayout.panelFrame(placement)
    let island = IslandLayout.islandFrame(for: .peek, placement, dictation: false, in: panel)
    let besidePill = NSPoint(x: island.minX + 6, y: island.minY + 10)
    let hits = IslandLayout.hitRegion(for: .peek, placement, dictation: false, in: panel)
    XCTAssertTrue(hits.contains { NSMouseInRect(besidePill, $0, false) }, "one rounded panel")
    XCTAssertFalse(
      hits.contains { NSMouseInRect(NSPoint(x: island.minX - 6, y: island.midY), $0, false) })
    let handles = IslandLayout.dragHandles(for: .peek, placement, dictation: false, in: panel)
    func grabs(_ point: NSPoint) -> Bool { handles.contains { NSMouseInRect(point, $0, false) } }
    XCTAssertTrue(grabs(NSPoint(x: island.midX, y: island.maxY - 10)), "the title row on top")
    XCTAssertTrue(grabs(besidePill), "the pill row, edge to edge")
    XCTAssertFalse(grabs(NSPoint(x: island.midX, y: island.maxY - IslandLayout.headerHeight - 30)),
      "the transcript scrolls instead")
  }

  func testTheNewestCaptionWordsAreSplitOffToBeDrawnBrighter() {
    let split = IslandText.wrap(
      "one two three four five six seven eight nine ten", width: 1000, newestWords: 3)
    XCTAssertEqual(split.map(\.earlier), ["one two three four five six seven "])
    XCTAssertEqual(split.map(\.newest), ["eight nine ten"])
    let short = IslandText.wrap("just this", width: 1000, newestWords: 3)
    XCTAssertEqual(short.map(\.earlier), [""])
    XCTAssertEqual(short.map(\.newest), ["just this"])
    let across = IslandText.wrap("one two three four", width: 1, newestWords: 3) {
      $0 == " " ? 0 : 1
    }
    XCTAssertEqual(across.map(\.earlier), ["one", "", "", ""])
    XCTAssertEqual(across.map(\.newest), ["", "two", "three", "four"])
  }

  func testElapsedTimeReadsLikeAClock() {
    XCTAssertEqual(IslandLayout.elapsedLabel(seconds: 0), "0:00")
    XCTAssertEqual(IslandLayout.elapsedLabel(seconds: 724), "12:04")
    XCTAssertEqual(IslandLayout.elapsedLabel(seconds: 3753), "1:02:33")
    XCTAssertEqual(IslandLayout.elapsedLabel(seconds: -5), "0:00")
  }

  func testCaptionShowsTheLatestSpeakersRunOfWords() {
    let bubbles = [
      bubble("1", "Sara", "Earlier line."),
      bubble("2", "Omar", "Can your email channel"),
      bubble("3", "Omar", "send a blind copy?"),
    ]
    XCTAssertEqual(
      LiveCaption.latest(from: bubbles),
      LiveCaption(
        id: "other:Omar", speaker: "Omar", text: "Can your email channel send a blind copy?",
        isSelf: false))
    XCTAssertNil(LiveCaption.latest(from: []))
  }

  func testAGrowingLineKeepsItsCaptionAndANewSpeakerGetsANewOne() {
    let first = LiveCaption.latest(from: [bubble("1", "Sara", "Hi"), bubble("2", "Omar", "Can")])
    let grown = LiveCaption.latest(from: [
      bubble("1", "Sara", "Hi"), bubble("2", "Omar", "Can your email"), bubble("3", "Omar", "copy?"),
    ])
    let next = LiveCaption.latest(from: [
      bubble("1", "Sara", "Hi"), bubble("2", "Omar", "Can your email"), bubble("3", "Sara", "Yes"),
    ])
    XCTAssertEqual(first?.id, grown?.id, "more words from the same speaker: no transition")
    XCTAssertNotEqual(grown?.id, next?.id, "a new speaker: the caption transitions")
    let long = (0..<80).map { bubble("\($0 + 10)", "Omar", "word\($0) of a long run") }
    let caption = LiveCaption.latest(from: long)
    XCTAssertEqual(caption?.id, "other:Omar")
    XCTAssertEqual(
      caption?.text.split(separator: " ").first, "word0",
      "the whole turn, so its wrapped lines keep their breaks as it grows")
  }

  func testTheOpenPanelHasOneFooterAndKeepsItsSizeWhereverItSits() {
    let cases: [(IslandPlacement, IslandBandContent)] = [
      (IslandPlacement(screen: notched, position: .topCenter), .quiet),
      (IslandPlacement(screen: external, position: .topLeft), .header),
      (IslandPlacement(screen: external, position: .bottomCenter), .footer),
    ]
    for (placement, band) in cases {
      XCTAssertEqual(IslandLayout.bandContent(for: .peek, placement, dictation: false), band)
      XCTAssertEqual(
        IslandLayout.bandContent(for: .collapsed, placement, dictation: false), .status)
      XCTAssertEqual(IslandLayout.bandContent(for: .peek, placement, dictation: true), .status)
      let rows =
        (band == .header ? 0 : IslandLayout.headerHeight)
        + IslandLayout.transcriptHeight(placement)
        + (band == .footer ? 0 : IslandLayout.controlsHeight)
      XCTAssertEqual(
        rows, IslandLayout.bodySize(for: .peek, placement, dictation: false).height,
        "\(placement.position): the rows fill the body exactly")
      XCTAssertEqual(IslandLayout.bodySize(for: .peek, placement, dictation: false).height, 234)
    }
  }

  func testTheTranscriptGroupsLinesIntoSpeakerTurns() {
    var bubbles = [
      bubble("a", "Sara", "Thanks for joining."),
      bubble("b", "Sara", "  "),
      bubble("c", "Sara", "Quick one."),
      bubble("d", "You", "Sure."),
      bubble("e", "Sara", "Can your email channel copy every reply?"),
    ]
    bubbles[3] = FloatingTranscriptBubblePayload(
      id: "d", speakerLabel: "You", text: "Sure.", isSelf: true, isFinal: false, startMs: 0,
      endMs: 0, overlapsPrevious: false, overlapsNext: true)
    let turns = TranscriptTurn.group(bubbles)
    XCTAssertEqual(turns.map(\.speaker), ["Sara", "You", "Sara"])
    XCTAssertEqual(turns.map(\.id), [0, 1, 2], "positions, not the churning bubble ids")
    XCTAssertEqual(turns[0].parts.map(\.text), ["Thanks for joining.", "Quick one."])
    XCTAssertEqual(turns[1].parts, [TranscriptTurn.Part(text: "Sure.", isFinal: false)])
    XCTAssertEqual(turns.map(\.overlaps), [false, true, false])
    XCTAssertEqual(TranscriptTurn.group([bubble("1", "عمر", "تمام، شكرًا")]).first?.isRightToLeft, true)
  }

  func testTheTranscriptFollowsNewSpeechUntilTheReaderScrollsUp() {
    var follow = TranscriptFollow()
    XCTAssertTrue(follow.following)
    follow.update(TranscriptScroll(offset: 100, content: 300, visible: 200))
    follow.update(TranscriptScroll(offset: 100, content: 340, visible: 200))
    XCTAssertTrue(follow.following, "new speech below the end is not the reader scrolling away")
    follow.update(TranscriptScroll(offset: 60, content: 340, visible: 200))
    XCTAssertFalse(follow.following, "the reader scrolled up")
    follow.update(TranscriptScroll(offset: 60, content: 400, visible: 200))
    XCTAssertFalse(follow.following, "more speech arrives while they read")
    follow.update(TranscriptScroll(offset: 200, content: 400, visible: 200))
    XCTAssertTrue(follow.following, "back at the end")
  }

  func testCaptionLinesBreakOnlyBetweenWords() {
    let text = "Oh, I love the taste of life. I love my touch, I want it. Boy, your eyes to me"
    let width: CGFloat = 200
    let lines = IslandText.wrap(text, width: width)
    XCTAssertGreaterThan(lines.count, 2)
    XCTAssertEqual(lines.map(\.text).joined(separator: " "), text, "no word is cut or lost")
    for line in lines {
      XCTAssertLessThanOrEqual(IslandText.captionWidth(Substring(line.text)), width + 1)
    }
    XCTAssertEqual(lines.map(\.index), Array(0..<lines.count))
  }

  func testEarlierCaptionLinesKeepTheirBreaksAsTheTurnGrows() {
    let words = "So I think we should ship it on Friday after the review and then tell the team"
      .split(separator: " ")
    var previous: [CaptionLine] = []
    for count in 1...words.count {
      let lines = IslandText.wrap(words.prefix(count).joined(separator: " "), width: 160)
      let settled = previous.dropLast().map(\.text)
      XCTAssertEqual(
        Array(lines.prefix(settled.count).map(\.text)), settled, "after \(count) words")
      previous = lines
    }
    XCTAssertGreaterThan(previous.count, 2)
  }

  func testAWordWiderThanALineIsTheOnlyThingSplit() {
    let url = "https://example.com/a/very/long/path/that/cannot/fit/on/one/caption/line"
    let lines = IslandText.wrap("see \(url) now", width: 160)
    XCTAssertEqual(lines.first?.text, "see")
    XCTAssertEqual(lines.last?.text.hasSuffix(" now"), true)
    XCTAssertEqual(
      lines.dropFirst().map(\.text).joined().replacingOccurrences(of: " now", with: ""), url)
  }

  func testArabicCaptionLinesTakeTheirOwnDirection() {
    let lines = IslandText.wrap(
      "Okay so about the follow up هل تم حل مشكلة الجلسات المفتوحة على واتساب", width: 190)
    XCTAssertEqual(lines.first?.isRightToLeft, false)
    XCTAssertEqual(lines.last?.isRightToLeft, true)
  }

  func testThePanelLeavesRoomForItsShadowButNeverAboveATopIsland() {
    let top = IslandPlacement(screen: notched)
    let panel = IslandLayout.panelFrame(top)
    let island = IslandLayout.frame(for: IslandLayout.panelSize(top), top)
    XCTAssertEqual(panel.maxY, island.maxY, "flush with the screen's top edge")
    XCTAssertEqual(panel.minY, island.minY - IslandLayout.shadowMargin)
    XCTAssertEqual(panel.minX, island.minX - IslandLayout.shadowMargin)
    XCTAssertEqual(IslandLayout.islandArea(top, in: panel), island)
    let bottom = IslandPlacement(screen: external, position: .bottomCenter)
    let bottomPanel = IslandLayout.panelFrame(bottom)
    let bottomIsland = IslandLayout.frame(for: IslandLayout.panelSize(bottom), bottom)
    XCTAssertEqual(bottomPanel.maxY, bottomIsland.maxY + IslandLayout.shadowMargin)
    XCTAssertEqual(IslandLayout.islandArea(bottom, in: bottomPanel), bottomIsland)
  }

  func testOnlyTheNeckCaptionsAndHeaderPickTheIslandUp() {
    let placement = IslandPlacement(screen: notched, captionWidth: 440, captionLines: 2)
    let panel = IslandLayout.panelFrame(placement)
    func grabs(_ mode: IslandMode, _ point: NSPoint) -> Bool {
      IslandLayout.dragHandles(for: mode, placement, dictation: false, in: panel)
        .contains { NSMouseInRect(point, $0, false) }
    }
    let onNeck = NSPoint(x: 756 - 150, y: 970)
    let onHeader = NSPoint(x: 756, y: 982 - 32 - 20)
    let onTranscript = NSPoint(x: 756, y: 982 - 32 - IslandLayout.controlsHeight - 40)
    XCTAssertTrue(grabs(.collapsed, onNeck))
    XCTAssertFalse(grabs(.collapsed, onHeader), "nothing below a collapsed island")
    XCTAssertTrue(grabs(.captions, onHeader), "the captions can be grabbed")
    XCTAssertTrue(grabs(.peek, onHeader), "the expanded header can be grabbed")
    XCTAssertFalse(grabs(.peek, onTranscript), "the transcript scrolls instead")
  }

  func testDirectionComesFromTheFirstStrongCharacter() {
    XCTAssertTrue(IslandText.isRightToLeft("هل تم حل مشكلة الجلسات؟"))
    XCTAssertTrue(IslandText.isRightToLeft("3 رسائل via WhatsApp"))
    XCTAssertFalse(IslandText.isRightToLeft("Okay, شكرا"))
    XCTAssertFalse(IslandText.isRightToLeft("12:04"))
  }

  func testWindowKeepsOneFrameWhileTheIslandChangesModeWithItsTopEdgePinned() {
    for position: LiveCaptionPosition in [.topCenter, .topLeft, .bottomCenter, .bottomRight] {
      for screen in [notched, external] {
        let placement = IslandPlacement(
          screen: screen, position: position, captionWidth: 640, captionLines: 4)
        let panel = IslandLayout.panelFrame(placement)
        for mode: IslandMode in [.collapsed, .captions, .peek, .open] {
          for dictation in [false, true] {
            let island = IslandLayout.islandFrame(
              for: mode, placement, dictation: dictation, in: panel)
            let label = "\(position) \(mode) dictation=\(dictation) notch=\(screen.hasNotch)"
            XCTAssertTrue(panel.contains(island), label)
            if placement.anchorsBottom {
              XCTAssertEqual(island.minY, panel.minY + IslandLayout.shadowMargin, label)
            } else {
              XCTAssertEqual(island.maxY, panel.maxY, label)
            }
          }
        }
      }
    }
    let placement = IslandPlacement(screen: notched)
    XCTAssertEqual(IslandLayout.panelFrame(placement).maxY, notched.frame.maxY)
    XCTAssertEqual(IslandLayout.panelFrame(placement).midX, 756)
  }

  func testClicksBesideTheIslandReachTheAppUnderneath() {
    let placement = IslandPlacement(screen: notched, captionWidth: 440, captionLines: 2)
    let panel = IslandLayout.panelFrame(placement)
    func hits(_ mode: IslandMode, _ point: NSPoint) -> Bool {
      IslandLayout.hitRegion(for: mode, placement, dictation: false, in: panel)
        .contains { NSMouseInRect(point, $0, false) }
    }
    let onNeck = NSPoint(x: 756 - 150, y: 970)
    let besideNeck = NSPoint(x: 756 - 210, y: 970)
    let underNeck = NSPoint(x: 756 - 190, y: 930)
    XCTAssertTrue(hits(.collapsed, onNeck))
    XCTAssertFalse(hits(.collapsed, besideNeck), "menu bar beside the neck stays clickable")
    XCTAssertFalse(hits(.collapsed, underNeck), "nothing below a collapsed island takes clicks")
    XCTAssertTrue(hits(.peek, underNeck), "the open panel takes clicks")
    XCTAssertFalse(hits(.peek, besideNeck), "even open, only the neck sits in the menu bar")
  }

  func testIslandOutlineChangesContinuouslyAsTheBodyOpens() {
    let shape = IslandShape(
      neckWidth: 360, neckHeight: 32, bodyWidth: 0, topFillet: 8, neckRadius: 12,
      joinFillet: 10, bodyRadius: 20)
    let bottomCorner = CGPoint(x: 400 / 2 - 180 + 1.5, y: 32 - 1.5)
    func covers(_ point: CGPoint, bodyHeight: CGFloat) -> Bool {
      shape.path(in: CGRect(x: 0, y: 0, width: 400, height: 32 + bodyHeight)).contains(point)
    }
    XCTAssertFalse(covers(bottomCorner, bodyHeight: 0), "collapsed neck has rounded corners")
    XCTAssertFalse(covers(bottomCorner, bodyHeight: 0.6), "a hairline of body keeps them round")
    XCTAssertFalse(covers(bottomCorner, bodyHeight: 2))
    XCTAssertTrue(covers(bottomCorner, bodyHeight: 40), "fully open, the neck meets the body")
  }

  func testCaptionsAppearOnlyWhileSomeoneIsSpeaking() {
    func mode(peeking: Bool = false, enabled: Bool = true, quiet: Bool, caption: Bool = true)
      -> IslandMode
    {
      FloatingBarViewModel.mode(
        dictation: false, isExpanded: enabled, isPeeking: peeking, captionsEnabled: enabled,
        isQuiet: quiet, hasCaption: caption)
    }
    XCTAssertEqual(mode(quiet: false), .captions)
    XCTAssertEqual(mode(quiet: true), .collapsed)
    XCTAssertEqual(mode(enabled: false, quiet: false), .collapsed)
    XCTAssertEqual(mode(quiet: false, caption: false), .collapsed)
    XCTAssertEqual(mode(peeking: true, quiet: true), .peek)
  }

  private func bubble(_ id: String, _ speaker: String, _ text: String)
    -> FloatingTranscriptBubblePayload
  {
    FloatingTranscriptBubblePayload(
      id: id, speakerLabel: speaker, text: text, isSelf: false, isFinal: true, startMs: 0,
      endMs: 0, overlapsPrevious: false, overlapsNext: false)
  }
}
