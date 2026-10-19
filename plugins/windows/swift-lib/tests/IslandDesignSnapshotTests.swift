import Cocoa
import SwiftUI
import XCTest

@testable import swift_lib

/// The island on four wallpapers (black, mid-grey, white, a busy photo-like one) with a menu bar
/// and a Dock, rendered to /tmp/floating-bar/v2-*.png. Bottom centre, the default, is the main
/// set; one image shows the island under the camera.
@MainActor
final class IslandDesignSnapshotTests: XCTestCase {
  private let outputDirectory = URL(fileURLWithPath: "/tmp/floating-bar")
  private let canvas = NSSize(width: 1100, height: 560)
  private let dockHeight: CGFloat = 66

  override func setUp() async throws {
    _ = NSApplication.shared
    try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
  }

  private var screen: IslandScreen {
    IslandScreen(
      frame: NSRect(origin: .zero, size: canvas),
      visibleFrame: NSRect(x: 0, y: dockHeight, width: canvas.width, height: canvas.height - 32 - dockHeight),
      safeAreaTop: 32, auxiliaryTopLeftWidth: 470, auxiliaryTopRightWidth: 470)
  }

  func testBottomCentreOnEveryWallpaper() throws {
    let states: [(String, () -> FloatingBarViewModel)] = [
      ("collapsed", { self.meeting(quiet: true) }),
      ("captions-en", {
        self.meeting(bubbles: [
          self.line("1", "Sara Ahmed", "Thanks for joining. Quick one before we start."),
          self.line(
            "2", "Sara Ahmed",
            "Can your email channel send a blind copy of every reply to our CRM inbox so sales sees it?"),
        ])
      }),
      ("captions-ar", {
        self.meeting(bubbles: [
          self.line("1", "عمر", "هل تم حل مشكلة الجلسات المفتوحة على واتساب؟ العميل بيسأل من الشهر اللي فات")
        ])
      }),
      ("expanded", {
        let model = self.meeting(bubbles: [
          self.line("1", "Sara", "Thanks for joining. Quick one before we start."),
          self.line("2", "You", "Sure, go ahead.", isSelf: true),
          self.line("3", "Sara", "Can your email channel send a blind copy of every reply to our CRM inbox?"),
          self.line("4", "Omar", "هل تم حل مشكلة الجلسات المفتوحة على واتساب؟"),
          self.line("5", "You", "Good question. Let me check that while we talk.", isSelf: true),
        ])
        model.isPeeking = true
        return model
      }),
      ("reconnecting", {
        let model = self.meeting(quiet: true)
        model.status = .reconnecting
        model.transcriptNotice = "Reconnecting live transcription…"
        model.isPeeking = true
        return model
      }),
      ("dictation", { self.dictation() }),
    ]
    for (state, make) in states {
      for (name, wallpaper) in wallpapers {
        let model = make()
        let rep = try render("v2-\(state)-\(name)", model, wallpaper: wallpaper)
        try assertReadable(rep, model, label: "\(state) on \(name)")
      }
    }
  }

  func testUnderTheCameraOption() throws {
    let model = meeting(
      bubbles: [line("1", "Sara", "Can your email channel copy every reply to our CRM?")],
      position: .topCenter)
    try render("v2-camera-captions-busy", model, wallpaper: .busy)
    let open = meeting(bubbles: [line("1", "Sara", "Thanks for joining.")], position: .topCenter)
    open.isPeeking = true
    try render("v2-camera-expanded-black", open, wallpaper: .solid(0))
  }

  /// The open meeting panel (v3-expanded-*.png): header, speaker turns, one footer.
  func testExpandedPanelOnEveryWallpaper() throws {
    let english = [
      line("1", "Sara Ahmed", "Thanks for joining. Quick one before we start."),
      line(
        "2", "Sara Ahmed",
        "Can your email channel send a blind copy of every reply to our CRM inbox?"),
      line(
        "3", "You", "Yes, that shipped last week. It's under the channel's settings.",
        isSelf: true),
      line("4", "Speaker 3", "And does that include replies the AI sends on its own?"),
      line("5", "You", "It does, every outbound reply", isSelf: true, isFinal: false),
    ]
    for (name, wallpaper) in wallpapers {
      let model = meeting(bubbles: english)
      model.isPeeking = true
      let rep = try render("v3-expanded-\(name)", model, wallpaper: wallpaper)
      try assertReadable(rep, model, label: "expanded on \(name)")
    }

    let arabic = meeting(bubbles: [
      line("1", "عمر", "هل تم حل مشكلة الجلسات المفتوحة على واتساب؟"),
      line("2", "عمر", "العميل بيسأل من الشهر اللي فات"),
      line("3", "You", "Yes, it shipped yesterday. I'll send the steps.", isSelf: true),
      line("4", "سارة", "تمام، شكرًا. هبعتها للفريق النهارده"),
    ])
    arabic.isPeeking = true
    try render("v3-expanded-arabic-black", arabic, wallpaper: .solid(0))

    for (name, position) in [("camera", LiveCaptionPosition.topCenter), ("topleft", .topLeft)] {
      let model = meeting(bubbles: english, position: position)
      model.isPeeking = true
      try render("v3-expanded-\(name)-busy", model, wallpaper: .busy)
    }

    let reconnecting = meeting(bubbles: english)
    reconnecting.status = .reconnecting
    reconnecting.transcriptNotice = "Reconnecting live transcription…"
    reconnecting.isPeeking = true
    try render("v3-expanded-reconnecting-grey", reconnecting, wallpaper: .solid(0.5))
  }

  private let wallpapers: [(String, Wallpaper)] = [
    ("black", .solid(0)), ("grey", .solid(0.5)), ("white", .solid(1)), ("busy", .busy),
  ]

  /// The island's panel is darker than the brightest wallpaper and lighter than black, and its text
  /// is near white on it.
  private func assertReadable(_ rep: NSBitmapImageRep, _ model: FloatingBarViewModel, label: String)
    throws
  {
    let island = islandRect(model)
    let scale = CGFloat(rep.pixelsWide) / canvas.width
    var surface: [CGFloat] = []
    var brightest: CGFloat = 0
    for y in stride(from: island.minY + 4, to: island.maxY - 4, by: 2) {
      for x in stride(from: island.minX + 4, to: island.maxX - 4, by: 2) {
        guard let value = rep.colorAt(x: Int(x * scale), y: Int(y * scale))?.brightnessComponent
        else { continue }
        surface.append(value)
        brightest = max(brightest, value)
      }
    }
    let sorted = surface.sorted()
    let median = sorted[sorted.count / 2]
    XCTAssertLessThan(median, 0.16, "\(label): the surface is dark")
    XCTAssertGreaterThan(median, 0.02, "\(label): the surface is lighter than black")
    XCTAssertGreaterThan(brightest, 0.95, "\(label): text is drawn near white")
  }

  private func islandRect(_ model: FloatingBarViewModel) -> NSRect {
    let size = IslandLayout.size(for: model.mode, model.placement, dictation: model.dictation != nil)
    let bottom = canvas.height - dockHeight - IslandLayout.screenMargin
    return NSRect(x: (canvas.width - size.width) / 2, y: bottom - size.height, width: size.width, height: size.height)
  }

  // MARK: - Fixtures

  private func meeting(
    bubbles: [FloatingTranscriptBubblePayload] = [], quiet: Bool = false,
    position: LiveCaptionPosition = .bottomCenter
  ) -> FloatingBarViewModel {
    let model = FloatingBarViewModel()
    model.placement = IslandPlacement(
      screen: screen, position: position, captionWidth: 520, captionLines: 2)
    model.title = "Northwind weekly sync"
    model.liveCaptionToggleVisible = true
    model.isExpanded = true
    model.amplitude = 0.55
    model.reduceMotion = true
    model.startedAt = Date().addingTimeInterval(-724)
    model.setTranscript(bubbles)
    model.isQuiet = quiet || bubbles.isEmpty
    return model
  }

  private func dictation() -> FloatingBarViewModel {
    let model = FloatingBarViewModel()
    model.placement = IslandPlacement(screen: screen, position: .bottomCenter)
    model.dictation = FloatingDictationPayload(
      sessionId: "d1", phase: "recording", microphone: "MacBook Pro Microphone",
      text: "Draft a reply to Sara saying the Bcc setting is live", partial: "and send the steps",
      previewEnabled: true, previewUnavailable: false)
    model.liveCaptionToggleVisible = true
    model.isExpanded = true
    model.amplitude = 0.7
    model.reduceMotion = true
    return model
  }

  private func line(
    _ id: String, _ speaker: String, _ text: String, isSelf: Bool = false, isFinal: Bool = true
  ) -> FloatingTranscriptBubblePayload {
    FloatingTranscriptBubblePayload(
      id: id, speakerLabel: speaker, text: text, isSelf: isSelf, isFinal: isFinal, startMs: 0,
      endMs: 0, overlapsPrevious: false, overlapsNext: false)
  }

  // MARK: - Rendering

  @discardableResult
  private func render(_ name: String, _ model: FloatingBarViewModel, wallpaper: Wallpaper) throws
    -> NSBitmapImageRep
  {
    let view = DesignScene(
      model: model, wallpaper: wallpaper, canvas: canvas, dockHeight: dockHeight,
      notchWidth: screen.notchWidth
    )
    .frame(width: canvas.width, height: canvas.height)
    let hosting = NSHostingView(rootView: view)
    hosting.frame = NSRect(origin: .zero, size: canvas)
    let window = offscreenWindow(hosting: hosting)
    defer { window.close() }
    hosting.layoutSubtreeIfNeeded()
    RunLoop.main.run(until: Date().addingTimeInterval(0.3))
    hosting.layoutSubtreeIfNeeded()
    let rep = try XCTUnwrap(hosting.bitmapImageRepForCachingDisplay(in: hosting.bounds))
    hosting.cacheDisplay(in: hosting.bounds, to: rep)
    try XCTUnwrap(rep.representation(using: .png, properties: [:]))
      .write(to: outputDirectory.appendingPathComponent("\(name).png"))
    return rep
  }
}

enum Wallpaper {
  case solid(Double)
  case busy
}

private struct DesignScene: View {
  let model: FloatingBarViewModel
  let wallpaper: Wallpaper
  let canvas: NSSize
  let dockHeight: CGFloat
  let notchWidth: CGFloat

  var body: some View {
    let placement = model.placement
    let size = IslandLayout.size(for: model.mode, placement, dictation: model.dictation != nil)
    let margin = IslandLayout.shadowMargin
    let bottom = placement.anchorsBottom
    ZStack(alignment: bottom ? .bottom : .top) {
      background
      VStack(spacing: 0) {
        menuBar
        Spacer()
        dock
      }
      if !bottom {
        UnevenRoundedRectangle(bottomLeadingRadius: 10, bottomTrailingRadius: 10)
          .fill(Color.black)
          .frame(width: notchWidth, height: 32)
      }
      FloatingBarView(model: model, settings: FloatingOverlaySettingsModel.shared)
        .frame(
          width: size.width + margin * 2, height: size.height + (bottom ? margin * 2 : margin))
        .padding(.bottom, bottom ? dockHeight + IslandLayout.screenMargin - margin : 0)
    }
  }

  @ViewBuilder
  private var background: some View {
    switch wallpaper {
    case .solid(let white):
      Color(white: white)
    case .busy:
      ZStack {
        LinearGradient(
          colors: [
            Color(red: 0.95, green: 0.62, blue: 0.36), Color(red: 0.36, green: 0.55, blue: 0.82),
            Color(red: 0.1, green: 0.18, blue: 0.3),
          ], startPoint: .topLeading, endPoint: .bottomTrailing)
        RadialGradient(
          colors: [Color(red: 1, green: 0.95, blue: 0.8), .clear], center: .init(x: 0.5, y: 0.85),
          startRadius: 0, endRadius: 260)
        RadialGradient(
          colors: [Color(red: 0.1, green: 0.35, blue: 0.2), .clear], center: .init(x: 0.2, y: 0.7),
          startRadius: 0, endRadius: 220)
        ForEach(0..<14, id: \.self) { index in
          Rectangle()
            .fill(Color.white.opacity(index.isMultiple(of: 2) ? 0.18 : 0.06))
            .frame(width: 6, height: canvas.height * 1.4)
            .rotationEffect(.degrees(28))
            .offset(x: CGFloat(index) * 80 - canvas.width / 2)
        }
      }
      .frame(width: canvas.width, height: canvas.height)
      .clipped()
    }
  }

  private var menuBar: some View {
    HStack(spacing: 18) {
      Image(systemName: "apple.logo")
      Text("Zoom").fontWeight(.semibold)
      Text("File")
      Text("Edit")
      Text("View")
      Spacer()
      Text("Sun 18 Oct  9:20")
    }
    .font(.system(size: 13))
    .foregroundStyle(Color.black.opacity(0.85))
    .padding(.horizontal, 14)
    .frame(height: 32)
    .background(Color.white.opacity(0.55))
  }

  private var dock: some View {
    HStack(spacing: 10) {
      ForEach(0..<9, id: \.self) { index in
        RoundedRectangle(cornerRadius: 11, style: .continuous)
          .fill(
            Color(hue: Double(index) / 9, saturation: 0.55, brightness: 0.85))
          .frame(width: 46, height: 46)
      }
    }
    .padding(.horizontal, 10)
    .frame(height: dockHeight - 8)
    .background(
      RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.white.opacity(0.3)))
    .padding(.bottom, 4)
  }
}
