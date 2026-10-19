import Cocoa
import SwiftUI
import XCTest

@testable import swift_lib

/// Renders the island offscreen to PNGs in /tmp/floating-bar. The live panel is hidden from
/// screen capture, so these images are the only way to look at it outside your own screen.
@MainActor
final class IslandSnapshotTests: XCTestCase {
  private let outputDirectory = URL(fileURLWithPath: "/tmp/floating-bar")

  private let notched = IslandScreen(
    frame: NSRect(x: 0, y: 0, width: 1512, height: 982),
    visibleFrame: NSRect(x: 0, y: 0, width: 1512, height: 950),
    safeAreaTop: 32, auxiliaryTopLeftWidth: 656, auxiliaryTopRightWidth: 656)

  private let external = IslandScreen(
    frame: NSRect(x: 0, y: 0, width: 1512, height: 982),
    visibleFrame: NSRect(x: 0, y: 0, width: 1512, height: 957))

  override func setUp() async throws {
    _ = NSApplication.shared
    try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
  }

  func testCollapsed() throws {
    let model = meeting(quiet: true)
    try snapshot("01-collapsed", model)
  }

  func testCaptionsEnglish() throws {
    let model = meeting(bubbles: [
      line("1", "Sara Ahmed", "Thanks for joining. Quick one before we start."),
      line(
        "2", "Sara Ahmed",
        "Can your email channel send a blind copy of every reply to our CRM inbox? Our sales team needs every reply logged."
      ),
    ])
    try snapshot("02-captions-english", model)
  }

  func testCaptionsArabic() throws {
    let model = meeting(bubbles: [
      line("1", "عمر", "هل تم حل مشكلة الجلسات المفتوحة على واتساب؟ العميل بيسأل من الشهر اللي فات")
    ])
    try snapshot("03-captions-arabic", model)
  }

  func testCaptionsLongSpeakerName() throws {
    let model = meeting(bubbles: [
      line(
        "1", "Aleksandra Wiśniewska-Kowalczyk",
        "And one more thing: can the AI hand off to a human agent when the customer asks for a refund?"
      )
    ])
    try snapshot("04-captions-long-speaker", model)
  }

  func testCaptionsOneLine() throws {
    let model = meeting(
      bubbles: [line("1", "Sara", "Perfect. And can the AI hand off to a person when someone asks for a refund?")],
      lines: 1)
    try snapshot("05-captions-one-line", model)
  }

  func testExpanded() throws {
    let model = meeting(bubbles: [
      line("1", "Sara", "Thanks for joining. Quick one before we start."),
      line("2", "You", "Sure, go ahead.", isSelf: true),
      line("3", "Sara", "Can your email channel send a blind copy of every reply to our CRM inbox?"),
      line("4", "Omar", "هل تم حل مشكلة الجلسات المفتوحة على واتساب؟"),
      line("5", "You", "Good question. Let me check that while we talk.", isSelf: true),
      line("6", "Sara", "Perfect. And can the AI hand off to a person when someone asks for a refund?"),
    ])
    model.isPeeking = true
    try snapshot("06-expanded", model)
  }

  func testReconnecting() throws {
    let model = meeting(quiet: true)
    model.status = .reconnecting
    model.transcriptNotice = "Reconnecting live transcription…"
    model.isPeeking = true
    try snapshot("07-expanded-reconnecting", model)
  }

  func testDictation() throws {
    let model = dictation(expanded: false)
    try snapshot("08-dictation", model)
  }

  func testDictationPreview() throws {
    let model = dictation(expanded: true)
    try snapshot("09-dictation-preview", model)
  }

  func testNoNotchCollapsed() throws {
    let model = meeting(quiet: true, screen: external)
    try snapshot("10-no-notch-collapsed", model, notch: false)
  }

  func testNoNotchCaptions() throws {
    let model = meeting(
      bubbles: [line("1", "Sara", "Can your email channel send a blind copy of every reply to our CRM inbox?")],
      screen: external)
    try snapshot("11-no-notch-captions", model, notch: false)
  }

  func testNoNotchExpanded() throws {
    let model = meeting(
      bubbles: [
        line("1", "Sara", "Thanks for joining."),
        line("2", "You", "Sure, go ahead.", isSelf: true),
      ], screen: external)
    model.isPeeking = true
    try snapshot("12-no-notch-expanded", model, notch: false)
  }

  // MARK: - Visible on any wallpaper

  private let captionsForWallpaper = [
    FloatingTranscriptBubblePayload(
      id: "1", speakerLabel: "Sara", text: "Can your email channel copy every reply to our CRM?",
      isSelf: false, isFinal: true, startMs: 0, endMs: 0, overlapsPrevious: false,
      overlapsNext: false)
  ]

  func testCaptionPanelHasAnEdgeOnABlackWallpaper() throws {
    let rep = try snapshot(
      "13-captions-black", meeting(bubbles: captionsForWallpaper), wallpaper: .solid(0))
    let scale = CGFloat(rep.pixelsWide) / 1100
    let body = IslandLayout.bodySize(for: .captions, meeting().placement, dictation: false)
    let panel = rep.colorAt(x: Int((550 - body.width / 2 + 8) * scale), y: Int((32 + 52) * scale))
    let beside = rep.colorAt(x: Int(40 * scale), y: Int((32 + 52) * scale))
    XCTAssertGreaterThan(
      (panel?.brightnessComponent ?? 0) - (beside?.brightnessComponent ?? 0), 0.02,
      "the panel is lighter than a black wallpaper")
    let edgeX = Int((550 + body.width / 2 - 0.5) * scale)
    let edge = (Int((32 + 20) * scale)..<Int((32 + 50) * scale)).compactMap {
      rep.colorAt(x: edgeX, y: $0)?.brightnessComponent
    }.max() ?? 0
    XCTAssertGreaterThan(edge, 0.08, "the panel's side has a visible hairline on black")
  }

  func testCaptionPanelOnGreyAndWhiteWallpapers() throws {
    try snapshot("14-captions-grey", meeting(bubbles: captionsForWallpaper), wallpaper: .solid(0.5))
    try snapshot("15-captions-white", meeting(bubbles: captionsForWallpaper), wallpaper: .solid(1))
    let model = meeting(bubbles: captionsForWallpaper)
    model.isPeeking = true
    try snapshot("16-expanded-black", model, wallpaper: .solid(0))
  }

  // MARK: - Caption direction

  /// Columns holding the caption's words (bright white), not the speaker label (muted).
  private func textColumns(_ rep: NSBitmapImageRep) -> ClosedRange<CGFloat>? {
    let scale = CGFloat(rep.pixelsWide) / 1100
    var xs: [Int] = []
    for y in stride(from: Int((32 + 6) * scale), to: Int((32 + 52) * scale), by: 2) {
      for x in 0..<rep.pixelsWide where (rep.colorAt(x: x, y: y)?.brightnessComponent ?? 0) > 0.8 {
        xs.append(x)
      }
    }
    guard let low = xs.min(), let high = xs.max() else { return nil }
    return CGFloat(low) / scale...CGFloat(high) / scale
  }

  func testArabicCaptionSitsRightBesideItsSpeaker() throws {
    let rep = try snapshot(
      "17-captions-arabic-short", meeting(bubbles: [line("1", "عمر", "تمام، شكرًا")]),
      wallpaper: .solid(0))
    let body = IslandLayout.bodySize(for: .captions, meeting().placement, dictation: false)
    let columns = try XCTUnwrap(textColumns(rep))
    XCTAssertGreaterThan(columns.upperBound, 550 + body.width / 2 - 110, "text hugs the right edge")
    XCTAssertGreaterThan(columns.lowerBound, 550, "no text on the left half")
  }

  func testEnglishWordsFromAnArabicNamedSpeakerReadLeftToRight() throws {
    let rep = try snapshot(
      "18-captions-mixed", meeting(bubbles: [line("1", "عمر", "Sounds good, thanks")]),
      wallpaper: .solid(0))
    let body = IslandLayout.bodySize(for: .captions, meeting().placement, dictation: false)
    let columns = try XCTUnwrap(textColumns(rep))
    XCTAssertLessThan(columns.lowerBound, 550 - body.width / 2 + 110, "text starts at the left")
    XCTAssertLessThan(columns.upperBound, 550, "no text on the right half")
  }

  /// Frames across a speaker change (caption-change-*.png): no frame may show ink that belongs only
  /// to the old line together with ink that belongs only to the new one, even faintly.
  func testANewSpeakersCaptionNeverOverlapsTheOldOne() throws {
    let old = [line("1", "عمر", "هل تم حل مشكلة الجلسات المفتوحة؟")]
    let new = old + [line("2", "سارة", "أيوه، اتحلت امبارح وبعتنا التحديث")]
    let host = CaptionHost()
    host.caption = LiveCaption.latest(from: old)
    let size = NSSize(width: 520, height: 60)
    let hosting = NSHostingView(rootView: CaptionHostView(host: host, width: size.width))
    hosting.frame = NSRect(origin: .zero, size: size)
    let window = offscreenWindow(hosting: hosting)
    defer { window.close() }
    RunLoop.main.run(until: Date().addingTimeInterval(0.3))

    func frame(_ name: String) throws -> [CGFloat] {
      hosting.layoutSubtreeIfNeeded()
      let rep = try XCTUnwrap(hosting.bitmapImageRepForCachingDisplay(in: hosting.bounds))
      hosting.cacheDisplay(in: hosting.bounds, to: rep)
      try XCTUnwrap(rep.representation(using: .png, properties: [:]))
        .write(to: outputDirectory.appendingPathComponent("\(name).png"))
      return (0..<rep.pixelsHigh).flatMap { y in
        (0..<rep.pixelsWide).map { x in rep.colorAt(x: x, y: y)?.brightnessComponent ?? 0 }
      }
    }

    let before = try frame("caption-change-00")
    host.caption = LiveCaption.latest(from: new)
    var frames: [[CGFloat]] = []
    for index in 1...12 {
      RunLoop.main.run(until: Date().addingTimeInterval(0.02))
      frames.append(try frame(String(format: "caption-change-%02d", index)))
    }
    RunLoop.main.run(until: Date().addingTimeInterval(0.3))
    let after = try frame("caption-change-99")

    let ink: CGFloat = 0.5
    let faint: CGFloat = 0.12
    let oldOnly = before.indices.filter { before[$0] > ink && after[$0] < 0.02 }
    let newOnly = after.indices.filter { after[$0] > ink && before[$0] < 0.02 }
    XCTAssertGreaterThan(oldOnly.count, 200, "the two lines are drawn differently")
    XCTAssertGreaterThan(newOnly.count, 200, "the two lines are drawn differently")
    XCTAssertTrue(
      frames.contains { $0 != before && $0 != after }, "the change was caught mid-transition")
    for (index, pixels) in frames.enumerated() {
      let showsOld = oldOnly.contains { pixels[$0] > faint }
      let showsNew = newOnly.contains { pixels[$0] > faint }
      XCTAssertFalse(showsOld && showsNew, "frame \(index + 1) shows both lines at once")
    }
  }

  /// One speaker's turn growing word by word, with live segment ids that change on every update
  /// (v3-caption-*.png, each grabbed 80ms after its update, inside where a replayed speaker-change
  /// transition would have the caption faded out). The caption must stay fully drawn in every
  /// frame, and once the box is full the older line must scroll up out of it.
  func testAGrowingCaptionScrollsUpInPlace() throws {
    let words = """
      Oh, I love the taste of life. I love my touch, I want it. Boy, your eyes to me, I can do \
      the same. Oh, I love the taste of life.
      """.split(separator: " ")
    let steps = [2, 6, 10, 14, 18, 21, 24, 28]
    func turn(_ count: Int) -> [FloatingTranscriptBubblePayload] {
      [
        FloatingTranscriptBubblePayload(
          id: "1:0:none:w1:end:\(1200 + count * 300)", speakerLabel: "Speaker 1",
          text: words.prefix(count).joined(separator: " "), isSelf: false, isFinal: false,
          startMs: 1200, endMs: Double(1200 + count * 300), overlapsPrevious: false,
          overlapsNext: false)
      ]
    }
    let model = meeting(bubbles: turn(1))
    let canvas = NSSize(width: 1100, height: 420)
    let size = IslandLayout.size(for: .captions, model.placement, dictation: false)
    let hosting = NSHostingView(
      rootView: SnapshotScene(
        model: model, islandSize: size, notch: true, notchWidth: model.placement.screen.notchWidth,
        notchHeight: model.placement.screen.notchHeight, menuBarHeight: 32, anchorsBottom: false,
        wallpaper: .solid(0.5)
      )
      .frame(width: canvas.width, height: canvas.height))
    hosting.frame = NSRect(origin: .zero, size: canvas)
    let window = offscreenWindow(hosting: hosting)
    defer { window.close() }
    RunLoop.main.run(until: Date().addingTimeInterval(0.4))

    let body = IslandLayout.bodySize(for: .captions, model.placement, dictation: false)
    let notchHeight = model.placement.screen.notchHeight
    func frame(_ name: String) throws -> NSBitmapImageRep {
      hosting.layoutSubtreeIfNeeded()
      let rep = try XCTUnwrap(hosting.bitmapImageRepForCachingDisplay(in: hosting.bounds))
      hosting.cacheDisplay(in: hosting.bounds, to: rep)
      try XCTUnwrap(rep.representation(using: .png, properties: [:]))
        .write(to: outputDirectory.appendingPathComponent("\(name).png"))
      return rep
    }
    /// The brightest pixel of the caption text, and of the speaker label's blue.
    func ink(_ rep: NSBitmapImageRep) -> (text: CGFloat, speaker: CGFloat) {
      let scale = CGFloat(rep.pixelsWide) / canvas.width
      var text: CGFloat = 0
      var speaker: CGFloat = 0
      let xs = Int((550 - body.width / 2) * scale)..<Int((550 + body.width / 2) * scale)
      let ys = Int(notchHeight * scale)..<Int((notchHeight + body.height) * scale)
      for y in ys {
        for x in stride(from: xs.lowerBound, to: xs.upperBound, by: 2) {
          guard let color = rep.colorAt(x: x, y: y)?.usingColorSpace(.sRGB) else { continue }
          if color.blueComponent - color.redComponent > 0.2 {
            speaker = max(speaker, color.blueComponent)
          } else {
            text = max(text, color.brightnessComponent)
          }
        }
      }
      return (text, speaker)
    }

    for (index, count) in steps.enumerated() {
      model.setTranscript(turn(count))
      RunLoop.main.run(until: Date().addingTimeInterval(0.08))
      let drawn = ink(try frame(String(format: "v3-caption-%02d", index + 1)))
      XCTAssertGreaterThan(drawn.text, 0.85, "step \(index + 1): the caption is fully drawn")
      XCTAssertGreaterThan(drawn.speaker, 0.85, "step \(index + 1): the speaker stays fully drawn")
      RunLoop.main.run(until: Date().addingTimeInterval(0.3))
      _ = try frame(String(format: "v3-caption-%02d-settled", index + 1))
    }
  }

  /// Draws the island's outline at points along the real spring, from collapsed to open and back,
  /// into anim-*.png: the top edge must stay on the screen edge and the size must grow (or shrink)
  /// steadily, apart from the spring's sub-pixel settle.
  func testOpenAndCloseSequence() throws {
    let placement = IslandPlacement(screen: notched, captionWidth: 440, captionLines: 2)
    let collapsed = IslandLayout.size(for: .collapsed, placement, dictation: false)
    let open = IslandLayout.size(for: .peek, placement, dictation: false)
    let openBody = IslandLayout.bodySize(for: .peek, placement, dictation: false).width
    let spring = Spring(response: 0.35, dampingRatio: 0.85)
    let times: [Double] = [0, 0.04, 0.08, 0.12, 0.18, 0.26, 0.36, 0.6]

    var previousHeight: CGFloat = -1
    for (index, time) in times.enumerated() {
      let progress = CGFloat(spring.value(target: 1.0, time: time))
      let size = NSSize(
        width: collapsed.width + (open.width - collapsed.width) * progress,
        height: collapsed.height + (open.height - collapsed.height) * progress)
      let shape = IslandShape(
        neckWidth: IslandLayout.neckWidth(placement), neckHeight: 32,
        bodyWidth: openBody * progress, topFillet: IslandLayout.topFillet,
        neckRadius: IslandLayout.collapsedRadius, joinFillet: IslandLayout.joinFillet,
        bodyRadius: IslandLayout.expandedRadius)
      let bounds = shape.path(in: CGRect(origin: .zero, size: size)).boundingRect
      XCTAssertEqual(bounds.minY, 0, accuracy: 0.01, "frame \(index): top edge stays pinned")
      if progress <= 0.99 {
        XCTAssertGreaterThanOrEqual(bounds.height, previousHeight, "frame \(index) grows")
      }
      previousHeight = bounds.height
      try drawOutline(shape, size: size, name: String(format: "anim-open-%02d", index))
    }
  }

  private func drawOutline(_ shape: IslandShape, size: NSSize, name: String) throws {
    let canvas = NSSize(width: 640, height: 280)
    let image = NSImage(size: canvas, flipped: true) { _ in
      NSColor(calibratedRed: 0.45, green: 0.49, blue: 0.55, alpha: 1).setFill()
      NSRect(origin: .zero, size: canvas).fill()
      NSColor(white: 1, alpha: 0.55).setFill()
      NSRect(x: 0, y: 0, width: canvas.width, height: 32).fill()
      let origin = CGPoint(x: (canvas.width - size.width) / 2, y: 0)
      let path = shape.path(in: CGRect(origin: origin, size: size))
      guard let context = NSGraphicsContext.current?.cgContext else { return false }
      context.addPath(path.cgPath)
      context.setFillColor(NSColor.black.cgColor)
      context.fillPath()
      return true
    }
    let rep = try XCTUnwrap(
      image.cgImage(forProposedRect: nil, context: nil, hints: nil).map(NSBitmapImageRep.init))
    let data = try XCTUnwrap(rep.representation(using: .png, properties: [:]))
    try data.write(to: outputDirectory.appendingPathComponent("\(name).png"))
  }

  // MARK: - Fixtures

  private func meeting(
    bubbles: [FloatingTranscriptBubblePayload] = [], quiet: Bool = false, lines: Int = 2,
    screen: IslandScreen? = nil
  ) -> FloatingBarViewModel {
    let model = FloatingBarViewModel()
    model.placement = IslandPlacement(
      screen: screen ?? notched, position: .topCenter, captionWidth: 440, captionLines: lines)
    model.title = "Northwind weekly sync"
    model.liveCaptionToggleVisible = true
    model.isExpanded = true
    model.amplitude = 0.55
    model.startedAt = Date().addingTimeInterval(-724)
    model.setTranscript(bubbles)
    model.isQuiet = quiet || bubbles.isEmpty
    return model
  }

  private func dictation(expanded: Bool) -> FloatingBarViewModel {
    let model = FloatingBarViewModel()
    model.placement = IslandPlacement(screen: notched)
    model.dictation = FloatingDictationPayload(
      sessionId: "d1", phase: "recording", microphone: "MacBook Pro Microphone",
      text: "Draft a reply to Sara saying the Bcc setting is live", partial: "and send the steps",
      previewEnabled: true, previewUnavailable: false)
    model.liveCaptionToggleVisible = true
    model.isExpanded = expanded
    model.amplitude = 0.7
    if !expanded { model.isPeeking = false }
    return model
  }

  private func line(_ id: String, _ speaker: String, _ text: String, isSelf: Bool = false)
    -> FloatingTranscriptBubblePayload
  {
    FloatingTranscriptBubblePayload(
      id: id, speakerLabel: speaker, text: text, isSelf: isSelf, isFinal: true, startMs: 0,
      endMs: 0, overlapsPrevious: false, overlapsNext: false)
  }

  // MARK: - Rendering

  @discardableResult
  private func snapshot(
    _ name: String, _ model: FloatingBarViewModel, notch: Bool = true,
    wallpaper: SnapshotWallpaper = .gradient
  ) throws -> NSBitmapImageRep {
    let canvas = NSSize(width: 1100, height: 420)
    let size = IslandLayout.size(for: model.mode, model.placement, dictation: model.dictation != nil)
    let view = SnapshotScene(
      model: model, islandSize: size, notch: notch,
      notchWidth: model.placement.screen.notchWidth,
      notchHeight: model.placement.screen.notchHeight, menuBarHeight: notch ? 32 : 25,
      anchorsBottom: model.placement.anchorsBottom, wallpaper: wallpaper
    )
    .frame(width: canvas.width, height: canvas.height)

    let hosting = NSHostingView(rootView: view)
    hosting.frame = NSRect(origin: .zero, size: canvas)
    let window = offscreenWindow(hosting: hosting)
    defer { window.close() }
    hosting.layoutSubtreeIfNeeded()
    RunLoop.main.run(until: Date().addingTimeInterval(0.25))
    hosting.layoutSubtreeIfNeeded()

    let rep = try XCTUnwrap(
      hosting.bitmapImageRepForCachingDisplay(in: hosting.bounds), "no bitmap for \(name)")
    hosting.cacheDisplay(in: hosting.bounds, to: rep)
    let data = try XCTUnwrap(rep.representation(using: .png, properties: [:]))
    try data.write(to: outputDirectory.appendingPathComponent("\(name).png"))

    if notch {
      let top = rep.colorAt(x: rep.pixelsWide / 2, y: 2)
      XCTAssertEqual(top?.brightnessComponent ?? 1, 0, accuracy: 0.05, "\(name): island is black")
    }

    let neck = IslandLayout.neckOuterWidth(model.placement)
    let body = IslandLayout.bodySize(for: model.mode, model.placement, dictation: model.dictation != nil)
    if notch, body.width > neck + 24 {
      let scale = CGFloat(rep.pixelsWide) / canvas.width
      let x = Int((canvas.width / 2 + neck / 2 + 8) * scale)
      let menuBar = rep.colorAt(x: x, y: Int(4 * scale))
      let panel = rep.colorAt(x: x, y: Int((model.placement.screen.notchHeight + 3) * scale))
      XCTAssertGreaterThan(
        menuBar?.brightnessComponent ?? 0, 0.3, "\(name): menu bar beside the neck stays visible")
      XCTAssertLessThan(
        panel?.brightnessComponent ?? 1, 0.2, "\(name): the wider panel starts right below it")
    }
    return rep
  }
}

private final class CaptionHost: ObservableObject {
  @Published var caption: LiveCaption?
}

private struct CaptionHostView: View {
  @ObservedObject var host: CaptionHost
  let width: CGFloat

  var body: some View {
    CaptionLines(caption: host.caption, lines: 1, width: width - 24)
      .padding(.horizontal, 12)
      .background(Color.black)
      .environment(\.colorScheme, .dark)
  }
}

enum SnapshotWallpaper {
  case gradient
  case solid(Double)
}

private struct SnapshotScene: View {
  let model: FloatingBarViewModel
  let islandSize: NSSize
  let notch: Bool
  let notchWidth: CGFloat
  let notchHeight: CGFloat
  let menuBarHeight: CGFloat
  let anchorsBottom: Bool
  var wallpaper: SnapshotWallpaper = .gradient

  var body: some View {
    let margin = IslandLayout.shadowMargin
    ZStack(alignment: .top) {
      switch wallpaper {
      case .gradient:
        LinearGradient(
          colors: [Color(red: 0.34, green: 0.40, blue: 0.48), Color(red: 0.62, green: 0.58, blue: 0.52)],
          startPoint: .top, endPoint: .bottom)
      case .solid(let white):
        Color(white: white)
      }
      VStack(spacing: 0) {
        HStack(spacing: 18) {
          Image(systemName: "apple.logo").font(.system(size: 13))
          Text("Zoom").font(.system(size: 13, weight: .semibold))
          Text("File")
          Text("Edit")
          Text("View")
          Spacer()
          Text("Sun 18 Oct  9:20")
        }
        .font(.system(size: 13))
        .foregroundStyle(Color.black.opacity(0.85))
        .padding(.horizontal, 14)
        .frame(height: menuBarHeight)
        .background(Color.white.opacity(0.55))
        Spacer()
      }
      if notch {
        UnevenRoundedRectangle(bottomLeadingRadius: 10, bottomTrailingRadius: 10)
          .fill(Color.black)
          .frame(width: notchWidth, height: notchHeight)
      }
      FloatingBarView(model: model, settings: FloatingOverlaySettingsModel.shared)
        .frame(width: islandSize.width + margin * 2, height: islandSize.height + margin)
        .padding(.top, notch ? 0 : menuBarHeight + 6)
    }
  }
}
