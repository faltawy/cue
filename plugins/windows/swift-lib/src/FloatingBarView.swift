import AppKit
import SwiftUI

enum IslandMotion {
  static let spring = Animation.spring(response: 0.35, dampingFraction: 0.85)

  /// One spring drives the whole island; with Reduce Motion the change is a short fade-like ease.
  static func change(reduceMotion: Bool) -> Animation {
    reduceMotion ? .easeOut(duration: 0.15) : spring
  }
}

/// Every colour the island uses. The surface is a near-black tint over a dark material, so the
/// island reads on black, grey, white and busy wallpapers; text contrast on it is at least 7:1
/// for captions and 4.5:1 for everything else.
enum IslandPalette {
  static let surface = Color(red: 0.075, green: 0.075, blue: 0.086)
  static let surfaceRaised = Color.white.opacity(0.09)
  static let surfacePressed = Color.white.opacity(0.16)
  /// A labeled button at rest: just enough fill to read as a button.
  static let surfaceRest = Color.white.opacity(0.06)
  /// Keyboard focus around a control.
  static let focus = Color.white.opacity(0.7)
  /// The neck under the camera, which must merge with the notch.
  static let notch = Color.black
  static let textPrimary = Color.white
  static let textSecondary = Color.white.opacity(0.66)
  /// Caption words already read: a step below the newest ones.
  static let textEarlier = Color.white.opacity(0.74)
  static let speaker = Color(red: 0.66, green: 0.76, blue: 1)
  static let hairline = Color.white.opacity(0.13)
  /// The one accent: the coach and anything asking for attention.
  static let accent = Color(red: 0.984, green: 0.749, blue: 0.141)
  /// Recording, and Stop on hover.
  static let danger = Color(red: 1, green: 0.27, blue: 0.23)

  static let surfaceTint = 0.86
}

/// A narrow neck (the band beside the camera) that widens into the captions or expanded panel
/// through concave fillets, so only the neck ever sits in the menu-bar line. With `topFillet` the
/// neck flares into the top edge like the notch; without it the neck is a pill.
struct IslandShape: Shape {
  var neckWidth: CGFloat
  var neckHeight: CGFloat
  var bodyWidth: CGFloat
  var topFillet: CGFloat
  var neckRadius: CGFloat
  var joinFillet: CGFloat
  var bodyRadius: CGFloat
  var flipped = false

  var animatableData: CGFloat {
    get { bodyWidth }
    set { bodyWidth = newValue }
  }

  /// Built from parts (neck, flares, body, fillets) whose sizes all shrink to zero together, so the
  /// outline changes continuously while the island opens and closes: no corner snaps from square
  /// to round at either end of the animation.
  func path(in rect: CGRect) -> Path {
    let midX = rect.width / 2
    let neckHalf = min(neckWidth, rect.width) / 2
    let neckLeft = midX - neckHalf
    let neckRight = midX + neckHalf
    let h = min(neckHeight, rect.height)
    let bodyHeight = max(0, rect.height - h)
    let flare = min(topFillet, max(0, (rect.width - neckHalf * 2) / 2), h / 2)
    let neckCorner = min(neckRadius, h / 2, neckHalf)
    let opening = min(1, bodyHeight / max(neckCorner, 1))
    let neckBottom = neckCorner * (1 - opening)

    var shape = UnevenRoundedRectangle(
      topLeadingRadius: flare > 0 ? 0 : neckCorner,
      bottomLeadingRadius: neckBottom,
      bottomTrailingRadius: neckBottom,
      topTrailingRadius: flare > 0 ? 0 : neckCorner,
      style: .continuous
    ).path(in: CGRect(x: neckLeft, y: 0, width: neckHalf * 2, height: h)).cgPath

    if flare > 0 {
      shape = shape.union(
        Self.fillet(corner: CGPoint(x: neckLeft, y: 0), dx: -flare, dy: flare), using: .winding)
      shape = shape.union(
        Self.fillet(corner: CGPoint(x: neckRight, y: 0), dx: flare, dy: flare), using: .winding)
    }

    if bodyHeight > 0.01 {
      let bodyHalf = min(max(bodyWidth, neckHalf * 2), rect.width) / 2
      let side = bodyHalf - neckHalf
      let join = max(0, min(joinFillet, side / 2, bodyHeight / 2, h - flare))
      let shoulder = max(0, min(bodyRadius, side - join, bodyHeight / 2))
      let bottom = min(bodyRadius, bodyHeight / 2, bodyHalf)
      let body = UnevenRoundedRectangle(
        topLeadingRadius: shoulder, bottomLeadingRadius: bottom,
        bottomTrailingRadius: bottom, topTrailingRadius: shoulder, style: .continuous
      ).path(in: CGRect(x: midX - bodyHalf, y: h, width: bodyHalf * 2, height: bodyHeight))
      shape = shape.union(body.cgPath, using: .winding)
      if join > 0.01 {
        shape = shape.union(
          Self.fillet(corner: CGPoint(x: neckLeft, y: h), dx: -join, dy: -join), using: .winding)
        shape = shape.union(
          Self.fillet(corner: CGPoint(x: neckRight, y: h), dx: join, dy: -join), using: .winding)
      }
    }

    let origin = CGAffineTransform(translationX: rect.minX, y: rect.minY)
    let flip = flipped
      ? CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: rect.height) : .identity
    return Path(shape).applying(flip.concatenating(origin))
  }

  /// A concave fillet tucked into `corner`: filled along the two edges that meet there, scooped
  /// out by a curve bowing toward the corner.
  private static func fillet(corner: CGPoint, dx: CGFloat, dy: CGFloat) -> CGPath {
    let path = CGMutablePath()
    path.move(to: CGPoint(x: corner.x + dx, y: corner.y))
    path.addLine(to: corner)
    path.addLine(to: CGPoint(x: corner.x, y: corner.y + dy))
    path.addQuadCurve(to: CGPoint(x: corner.x + dx, y: corner.y), control: corner)
    path.closeSubpath()
    return path
  }
}

struct FloatingBarView: View {
  @ObservedObject var model: FloatingBarViewModel
  @ObservedObject var settings: FloatingOverlaySettingsModel
  var onSettings: () -> Void = {}
  @State private var hoveredControl: String?

  private var mode: IslandMode { model.mode }
  private var placement: IslandPlacement { model.placement }
  private var notch: Bool { placement.usesNotch }

  var body: some View {
    Group {
      if model.isDragging {
        dragPill
      } else {
        island
      }
    }
    .environment(\.colorScheme, .dark)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(model.dictation != nil ? "Dictation" : "Recording, \(model.title)")
  }

  private var island: some View {
    let size = IslandLayout.size(for: mode, placement, dictation: model.dictation != nil)
    let bodyWidth = IslandLayout.bodySize(for: mode, placement, dictation: model.dictation != nil)
      .width
    let shape = islandShape(bodyWidth: bodyWidth)
    let bottom = placement.anchorsBottom
    let margin = IslandLayout.shadowMargin
    return VStack(spacing: 0) {
      if bottom { detail.frame(width: bodyWidth) }
      band.frame(width: bandWidth(bodyWidth: bodyWidth), height: IslandLayout.bandHeight(placement))
      if !bottom { detail.frame(width: bodyWidth) }
    }
    .frame(width: size.width, height: size.height, alignment: bottom ? .bottom : .top)
    .background(background(shape))
    .clipShape(shape)
    .overlay(edge(shape))
    .background(shadow(shape))
    .contentShape(shape)
    .onTapGesture { if mode == .collapsed || mode == .captions { model.peekNow() } }
    .animation(IslandMotion.change(reduceMotion: model.reduceMotion), value: mode)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
    .padding(
      EdgeInsets(top: bottom ? margin : 0, leading: margin, bottom: margin, trailing: margin))
  }

  /// Under the camera the band is the neck beside the notch; elsewhere it is the pill, which spans
  /// the panel once it opens so the timer and level sit at the panel's edges.
  private func bandWidth(bodyWidth: CGFloat) -> CGFloat {
    let neck = IslandLayout.neckWidth(placement)
    return notch || mode == .collapsed ? neck : max(neck, bodyWidth)
  }

  /// What follows the pointer while the island is dragged to another place or display.
  private var dragPill: some View {
    HStack(spacing: 0) {
      leftWing
      Spacer(minLength: 8)
      rightWing
    }
    .padding(.horizontal, 12)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(surface(Capsule(style: .continuous)))
    .overlay(Capsule(style: .continuous).strokeBorder(IslandPalette.hairline, lineWidth: 1))
    .accessibilityLabel("Moving")
  }

  private var alignment: Alignment {
    switch placement.position {
    case .topLeft: return .topLeading
    case .topCenter: return .top
    case .topRight: return .topTrailing
    case .bottomLeft: return .bottomLeading
    case .bottomCenter: return .bottom
    case .bottomRight: return .bottomTrailing
    }
  }

  @ViewBuilder
  private var detail: some View {
    switch mode {
    case .collapsed:
      EmptyView()
    case .captions:
      captions
        .frame(height: IslandLayout.captionHeight(lines: placement.captionLines))
        .transition(contentTransition)
    case .peek, .open:
      Group {
        if model.dictation != nil {
          VStack(spacing: 0) {
            if placement.anchorsBottom { dictationPreview }
            controlsRow.frame(height: IslandLayout.controlsHeight)
            if !placement.anchorsBottom { dictationPreview }
          }
        } else {
          let band = IslandLayout.bandContent(for: mode, placement, dictation: false)
          let transcriptHeight = IslandLayout.transcriptHeight(placement)
          VStack(spacing: 0) {
            if band != .header { panelHeader.frame(height: IslandLayout.headerHeight) }
            TranscriptHistory(model: model, height: transcriptHeight)
              .frame(height: transcriptHeight)
              .padding(.horizontal, horizontalPadding + 2)
            if band != .footer { panelFooter.frame(height: IslandLayout.controlsHeight) }
          }
        }
      }
      .transition(contentTransition)
    }
  }

  /// Content fades in once the island has made room and fades out before it closes, drifting a
  /// few points with the edge that moves.
  private var contentTransition: AnyTransition {
    if model.reduceMotion { return .opacity }
    let drift: CGFloat = placement.anchorsBottom ? 6 : -6
    return .asymmetric(
      insertion: .opacity.combined(with: .offset(y: drift))
        .animation(.easeOut(duration: 0.2).delay(0.06)),
      removal: .opacity.animation(.easeIn(duration: 0.1)))
  }

  @ViewBuilder
  private var dictationPreview: some View {
    if let dictation = model.dictation, mode == .open {
      ScrollView(.vertical, showsIndicators: false) {
        DictationTranscript(dictation: dictation, color: IslandPalette.textPrimary)
          .padding(.vertical, 10)
      }
      .frame(height: IslandLayout.dictationPreviewHeight)
      .padding(.horizontal, horizontalPadding)
      .overlay(alignment: placement.anchorsBottom ? .bottom : .top) { hairline }
    }
  }

  private var hairline: some View {
    Rectangle().fill(IslandPalette.hairline).frame(height: 1)
      .padding(.horizontal, horizontalPadding)
  }

  private func surface<S: Shape>(_ shape: S, tint: Double = IslandPalette.surfaceTint) -> some View {
    ZStack {
      shape.fill(.ultraThickMaterial)
      shape.fill(IslandPalette.surface.opacity(tint))
    }
  }

  /// Under the camera the neck stays pure black so it merges with the notch. The captions follow
  /// the caption opacity setting, never so far that the material stops carrying the text.
  private func background(_ shape: AnyShape) -> some View {
    let band = IslandLayout.bandHeight(placement)
    let tint =
      mode == .captions
      ? min(max(settings.liveCaptionOpacity, 0.5), 1) : IslandPalette.surfaceTint
    return ZStack(alignment: placement.anchorsBottom ? .bottom : .top) {
      surface(shape, tint: tint)
      if notch {
        Rectangle().fill(IslandPalette.notch).frame(height: band)
      }
    }
    .clipShape(shape)
  }

  /// A hairline along the outline. Under the camera it skips the neck, which has no outline where
  /// it meets the notch and the menu bar, and only shows once the panel opens.
  @ViewBuilder
  private func edge(_ shape: AnyShape) -> some View {
    if notch {
      let band = IslandLayout.bandHeight(placement)
      shape.stroke(IslandPalette.hairline, lineWidth: 1)
        .mask(
          VStack(spacing: 0) {
            Color.clear.frame(height: band - 1)
            Rectangle()
          }
        )
        .opacity(mode == .collapsed ? 0 : 1)
        .allowsHitTesting(false)
    } else {
      shape.stroke(IslandPalette.hairline, lineWidth: 1).allowsHitTesting(false)
    }
  }

  private func shadow(_ shape: AnyShape) -> some View {
    let collapsed = mode == .collapsed
    return shape.fill(Color.black)
      .shadow(
        color: .black.opacity(collapsed ? 0.28 : 0.35), radius: collapsed ? 10 : 18,
        y: placement.anchorsBottom ? -(collapsed ? 3 : 6) : (collapsed ? 3 : 6))
      .opacity(notch && collapsed ? 0 : 1)
      .allowsHitTesting(false)
  }

  private func islandShape(bodyWidth: CGFloat) -> AnyShape {
    guard notch else {
      return AnyShape(
        RoundedRectangle(
          cornerRadius: mode == .collapsed ? IslandLayout.pillHeight / 2 : IslandLayout.expandedRadius,
          style: .circular))
    }
    return AnyShape(
      IslandShape(
        neckWidth: IslandLayout.neckWidth(placement),
        neckHeight: IslandLayout.bandHeight(placement),
        bodyWidth: bodyWidth,
        topFillet: IslandLayout.topFillet,
        neckRadius: IslandLayout.collapsedRadius,
        joinFillet: IslandLayout.joinFillet,
        bodyRadius: IslandLayout.expandedRadius))
  }

  private var horizontalPadding: CGFloat { 14 }

  @ViewBuilder
  private var band: some View {
    let content = IslandLayout.bandContent(for: mode, placement, dictation: model.dictation != nil)
    switch content {
    case .status, .quiet:
      HStack(spacing: 0) {
        leftWing
        Spacer(minLength: notch ? placement.screen.notchWidth : 8)
        rightWing
      }
      .padding(.horizontal, horizontalPadding)
      .opacity(content == .quiet ? 0 : 1)
      .animation(.easeOut(duration: 0.15), value: content)
    case .header:
      panelHeader.transition(contentTransition)
    case .footer:
      // The pill row is shorter than a footer; the actions sit a little up into the transcript's
      // bottom margin so they clear the panel's rounded bottom edge.
      panelFooter.offset(y: -5).transition(contentTransition)
    }
  }

  @ViewBuilder
  private var leftWing: some View {
    if model.dictation != nil {
      LevelBars(amplitude: model.amplitude, color: IslandPalette.textPrimary, bars: 5, maxHeight: 14)
        .frame(width: 26, height: 16)
        .accessibilityLabel("Listening")
    } else {
      switch model.status {
      case .recording:
        HStack(spacing: 7) {
          LiveDot(reduceMotion: model.reduceMotion)
          ElapsedTime(startedAt: model.startedAt)
        }
      case .reconnecting:
        HStack(spacing: 5) {
          Image(systemName: "arrow.triangle.2.circlepath")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(IslandPalette.textSecondary)
          if notch {
            ElapsedTime(startedAt: model.startedAt)
          } else {
            Text("Reconnecting")
              .font(.system(size: 12, weight: .medium))
              .foregroundStyle(IslandPalette.textSecondary)
              .lineLimit(1)
              .fixedSize()
          }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Reconnecting")
      case .error:
        HStack(spacing: 6) {
          Image(systemName: "exclamationmark.triangle.fill")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(IslandPalette.accent)
            .accessibilityLabel(model.transcriptNotice ?? "Recording needs attention")
          ElapsedTime(startedAt: model.startedAt)
        }
      }
    }
  }

  @ViewBuilder
  private var rightWing: some View {
    if let dictation = model.dictation {
      if mode == .peek || mode == .open {
        Color.clear.frame(width: 22, height: 22)
      } else if dictation.phase == "transcribing" {
        ProgressView().controlSize(.mini).frame(width: 22, height: 22)
          .accessibilityLabel("Finishing dictation")
      } else {
        StopButton(diameter: 22, label: "Finish dictation", help: "Done") {
          dictationAction("finish")
        }
      }
    } else {
      LevelBars(amplitude: model.amplitude, color: IslandPalette.textPrimary, bars: 4, maxHeight: 13)
        .frame(width: 22, height: 15)
        .accessibilityHidden(true)
    }
  }

  private var captions: some View {
    CaptionLines(
      caption: model.caption, lines: placement.captionLines,
      width: IslandLayout.bodySize(for: .captions, placement, dictation: false).width
        - horizontalPadding * 2, reduceMotion: model.reduceMotion)
      .padding(.horizontal, horizontalPadding + 2)
      .padding(.top, placement.anchorsBottom ? IslandLayout.captionBottomPadding : IslandLayout.captionTopPadding)
      .padding(.bottom, placement.anchorsBottom ? IslandLayout.captionTopPadding : IslandLayout.captionBottomPadding)
  }

  /// The meeting's title and, when something is wrong, what it is in words with an icon; the
  /// caption switches sit at its end, small, since they are rarely touched mid-meeting.
  private var panelHeader: some View {
    HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 1) {
        Text(model.title)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(IslandPalette.textPrimary)
          .lineLimit(1)
          .truncationMode(.tail)
        if model.status != .recording, let notice = model.transcriptNotice {
          Label {
            Text(notice).lineLimit(1).truncationMode(.tail)
          } icon: {
            Image(
              systemName: model.status == .error
                ? "exclamationmark.triangle.fill" : "arrow.triangle.2.circlepath"
            )
            .foregroundStyle(
              model.status == .error ? IslandPalette.accent : IslandPalette.textSecondary)
          }
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(IslandPalette.textSecondary)
          .labelStyle(.titleAndIcon)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      HStack(spacing: 0) {
        if model.liveCaptionToggleVisible {
          let label = model.captionsEnabled ? "Hide captions" : "Show captions"
          IslandButton(
            systemName: model.captionsEnabled ? "captions.bubble.fill" : "captions.bubble",
            label: label, isOn: model.captionsEnabled, size: 28
          ) { settings.setLiveCaptionMinimized(model.captionsEnabled) }
        }
        IslandButton(
          systemName: "slider.horizontal.3", label: "Caption settings", size: 28,
          action: onSettings)
      }
    }
    .padding(.leading, horizontalPadding + 2)
    .padding(.trailing, horizontalPadding - 4)
  }

  /// The panel's one footer: what is recording on the left, the actions on the right, with Stop
  /// last and the only red.
  private var panelFooter: some View {
    HStack(spacing: 6) {
      meetingStatus
      Spacer(minLength: 8)
      PanelActionButton(
        title: "Coach", systemName: "lightbulb.fill", iconTint: IslandPalette.accent,
        help: "Coach  ⇧⌘K"
      ) { RustBridge.toggleCoach() }
      PanelActionButton(title: "Open note", systemName: "arrow.up.forward.app") {
        RustBridge.openMainWindow()
      }
      PanelActionButton(
        title: "Stop", systemName: "stop.fill", help: "Stop recording", role: .destructive
      ) { RustBridge.stopListening() }
      .accessibilityLabel("Stop recording")
    }
    .padding(.leading, horizontalPadding + 2)
    .padding(.trailing, horizontalPadding - 2)
  }

  @ViewBuilder
  private var meetingStatus: some View {
    HStack(spacing: 7) {
      switch model.status {
      case .recording:
        LiveDot(reduceMotion: model.reduceMotion)
        ElapsedTime(startedAt: model.startedAt)
      case .reconnecting:
        Image(systemName: "arrow.triangle.2.circlepath")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(IslandPalette.textSecondary)
        Text("Reconnecting")
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(IslandPalette.textSecondary)
          .lineLimit(1)
          .fixedSize()
      case .error:
        Image(systemName: "exclamationmark.triangle.fill")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(IslandPalette.accent)
          .accessibilityLabel(model.transcriptNotice ?? "Recording needs attention")
        ElapsedTime(startedAt: model.startedAt)
      }
      LevelBars(
        amplitude: model.amplitude, color: IslandPalette.textSecondary, bars: 4, maxHeight: 12
      )
      .frame(width: 18, height: 14)
      .accessibilityHidden(true)
    }
    .accessibilityElement(children: .combine)
  }

  /// Dictation's row: what is listening, with the preview switch and Done at the end; the hovered
  /// control's name shows at the start of the row.
  private var controlsRow: some View {
    HStack(spacing: 2) {
      ZStack(alignment: .leading) {
        Color.clear
        if let hoveredControl {
          Text(hoveredControl)
            .foregroundStyle(IslandPalette.textSecondary)
            .transition(.opacity)
        } else if let dictation = model.dictation {
          VStack(alignment: .leading, spacing: 1) {
            Text("Dictation").foregroundStyle(IslandPalette.textPrimary)
              .font(.system(size: 13, weight: .semibold))
            if !dictation.microphone.isEmpty {
              Text(dictation.microphone).foregroundStyle(IslandPalette.textSecondary)
            }
          }
        }
      }
      .font(.system(size: 11, weight: .medium))
      .lineLimit(1)
      .truncationMode(.tail)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.trailing, 6)
      .animation(.easeOut(duration: 0.12), value: hoveredControl)
      controls
    }
    .padding(.horizontal, horizontalPadding - 2)
  }

  private func hover(_ label: String) -> (Bool) -> Void {
    { [label] inside in
      if inside {
        hoveredControl = label
      } else if hoveredControl == label {
        hoveredControl = nil
      }
    }
  }

  private var stopDivider: some View {
    Rectangle().fill(IslandPalette.hairline).frame(width: 1, height: 18).padding(.horizontal, 6)
  }

  @ViewBuilder
  private var controls: some View {
    if let dictation = model.dictation {
      IslandButton(
        systemName: "text.alignleft",
        label: model.isExpanded ? "Hide preview" : "Show preview",
        isOn: model.isExpanded, onHover: hover(model.isExpanded ? "Hide preview" : "Show preview")
      ) { dictationAction("togglePreview") }
      stopDivider
      StopButton(
        diameter: 30, label: "Finish dictation", help: "Done",
        disabled: dictation.phase == "transcribing", onHover: hover("Done")
      ) { dictationAction("finish") }
    }
  }

  private func dictationAction(_ action: String) {
    guard let dictation = model.dictation else { return }
    let payload = ["sessionId": dictation.sessionId, "action": action]
    if let data = try? JSONSerialization.data(withJSONObject: payload),
      let json = String(data: data, encoding: .utf8)
    {
      json.withCString { rust_on_floating_bar_dictation_action($0) }
    }
  }
}

/// Recording: a red dot that breathes, still with Reduce Motion.
private struct LiveDot: View {
  let reduceMotion: Bool
  @State private var dim = false

  var body: some View {
    Circle()
      .fill(IslandPalette.danger)
      .frame(width: 8, height: 8)
      .opacity(dim ? 0.45 : 1)
      .onAppear {
        guard !reduceMotion else { return }
        withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { dim = true }
      }
      .accessibilityLabel("Recording")
  }
}

struct CaptionLines: View {
  let caption: LiveCaption?
  let lines: Int
  let width: CGFloat
  var reduceMotion = false

  /// One speaker turn at a time: a growing turn updates in place, scrolling its lines up, and a
  /// new speaker's turn replaces the old one with no frame where both are visible.
  var body: some View {
    ZStack(alignment: .bottom) {
      if let caption {
        CaptionRow(caption: caption, lines: lines, width: width, reduceMotion: reduceMotion)
          .id(caption.id)
          .transition(
            .asymmetric(
              insertion: .opacity.combined(with: .offset(y: 4))
                .animation(
                  .easeOut(duration: CaptionMotion.insertion).delay(CaptionMotion.insertionDelay)),
              removal: .opacity.animation(.linear(duration: CaptionMotion.removal))))
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.updatesFrequently)
  }
}

/// A fixed box of `lines` lines, like macOS Live Captions: the turn is word-wrapped and
/// bottom-aligned, the newest line at the bottom; as it grows the older lines scroll up and out
/// under a soft fade at the top. A line never starts or ends inside a word, and lines on screen
/// keep their breaks, so nothing shifts sideways as words arrive.
///
/// In a right-to-left caption the layout direction flips, so "leading" is the right edge: the
/// speaker sits at the right and the text box beside it, mirroring a left-to-right caption. Each
/// line then takes its own direction from its words, not the speaker's name.
struct CaptionRow: View {
  let caption: LiveCaption
  let lines: Int
  let width: CGFloat
  var reduceMotion = false

  var body: some View {
    let lines = min(max(lines, LiveCaptionLayout.minLineCount), LiveCaptionLayout.maxLineCount)
    let lineHeight = IslandLayout.captionLineHeight
    let textWidth = min(width * 0.74, IslandLayout.captionTextMaxWidth)
    let wrapped = IslandText.wrap(caption.text, width: textWidth - 2)
    let newest = wrapped.last?.index ?? 0
    let shown = wrapped.suffix(lines + 1)
    let firstVisible = max(wrapped.count - lines, 0)
    let fade = wrapped.count > lines ? min(CaptionMotion.topFade / CGFloat(lines), 0.25) : 0
    let scroll: Animation? = reduceMotion ? nil : .easeOut(duration: CaptionMotion.scroll)

    HStack(alignment: .bottom, spacing: 10) {
      Text(caption.speaker)
        .font(.system(size: 11, weight: .semibold))
        .textCase(.uppercase)
        .tracking(0.4)
        .foregroundStyle(IslandPalette.speaker)
        .lineLimit(1)
        .frame(maxWidth: width * 0.24, alignment: .leading)
        .fixedSize(horizontal: true, vertical: false)
        .frame(height: lineHeight)
        .offset(y: 1 - CGFloat(newest - firstVisible) * lineHeight)
        .animation(scroll, value: newest - firstVisible)
      ZStack(alignment: .bottom) {
        ForEach(shown) { line in
          (Text(line.earlier).foregroundColor(IslandPalette.textEarlier)
            + Text(line.newest).foregroundColor(IslandPalette.textPrimary))
            .font(.system(size: IslandLayout.captionFontSize, weight: .medium))
            .lineLimit(1)
            .fixedSize()
            .contentTransition(.identity)
            .frame(width: textWidth, height: lineHeight, alignment: .leading)
            .environment(\.layoutDirection, line.isRightToLeft ? .rightToLeft : .leftToRight)
            .offset(y: -CGFloat(newest - line.index) * lineHeight)
            .transition(
              .asymmetric(
                insertion: .offset(y: lineHeight).combined(with: .opacity), removal: .opacity))
        }
      }
      .frame(width: textWidth, height: CGFloat(lines) * lineHeight, alignment: .bottom)
      .clipped()
      .mask(CaptionFade(fraction: fade))
      .animation(scroll, value: newest)
      Spacer(minLength: 0)
    }
    .frame(height: CGFloat(lines) * lineHeight, alignment: .bottom)
    .environment(\.layoutDirection, caption.isRightToLeft ? .rightToLeft : .leftToRight)
    .transaction { $0.animation = nil }
  }
}

/// Lines scrolling out at the top soften away instead of being cut by the edge.
private struct CaptionFade: View {
  /// How far down the box the fade reaches, as a fraction of its height.
  let fraction: CGFloat

  var body: some View {
    LinearGradient(
      stops: [
        .init(color: fraction > 0 ? .clear : .black, location: 0),
        .init(color: .black, location: fraction),
      ],
      startPoint: .top, endPoint: .bottom)
  }
}

/// The transcript as speaker turns, newest at the bottom. It follows new speech until the reader
/// scrolls up, and picks up again once they scroll back to the end; lines leaving at the top fade
/// out instead of being cut off.
private struct TranscriptHistory: View {
  @ObservedObject var model: FloatingBarViewModel
  let height: CGFloat
  @State private var follow = TranscriptFollow()

  private static let end = "transcript-end"

  var body: some View {
    let turns = TranscriptTurn.group(model.transcriptBubbles)
    ScrollViewReader { proxy in
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 14) {
          if turns.isEmpty {
            Text("Listening…")
              .font(.system(size: 13, weight: .medium))
              .foregroundStyle(IslandPalette.textSecondary)
              .frame(maxWidth: .infinity, minHeight: height - 40)
          }
          ForEach(turns) { TranscriptTurnView(turn: $0) }
          if model.status == .recording, let notice = model.transcriptNotice {
            Text(notice)
              .font(.system(size: 11, weight: .medium))
              .foregroundStyle(IslandPalette.textSecondary)
              .frame(maxWidth: .infinity)
          }
          Color.clear.frame(height: 0).id(Self.end)
        }
        .padding(.top, IslandLayout.transcriptTopFade)
        .padding(.bottom, 12)
      }
      .defaultScrollAnchor(.bottom)
      .modifier(FollowsScroll(follow: $follow))
      .onChange(of: model.transcriptBubbles) {
        if follow.following { proxy.scrollTo(Self.end, anchor: .bottom) }
      }
    }
    .mask(
      LinearGradient(
        stops: [
          .init(color: .clear, location: 0),
          .init(color: .black, location: IslandLayout.transcriptTopFade / max(height, 1)),
          .init(color: .black, location: 1 - 6 / max(height, 1)),
          .init(color: .black.opacity(0.4), location: 1),
        ],
        startPoint: .top, endPoint: .bottom))
  }
}

/// Feeds scroll positions to `TranscriptFollow` where the system reports them (macOS 15); before
/// that the transcript always follows the newest speech.
private struct FollowsScroll: ViewModifier {
  @Binding var follow: TranscriptFollow

  func body(content: Content) -> some View {
    if #available(macOS 15, *) {
      content.onScrollGeometryChange(for: TranscriptScroll.self) {
        TranscriptScroll(
          offset: $0.contentOffset.y, content: $0.contentSize.height,
          visible: $0.containerSize.height)
      } action: { _, scroll in
        follow.update(scroll)
      }
    } else {
      content
    }
  }
}

/// One speaker's turn: their name on its own line, then everything they said until someone else
/// spoke. Words still being recognized are a step dimmer. The turn's words set its direction.
private struct TranscriptTurnView: View {
  let turn: TranscriptTurn

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(spacing: 4) {
        Text(turn.speaker)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(turn.isSelf ? IslandPalette.textSecondary : IslandPalette.speaker)
          .lineLimit(1)
          .truncationMode(.tail)
        if turn.overlaps {
          Image(systemName: "arrow.left.and.right")
            .font(.system(size: 8, weight: .bold))
            .foregroundStyle(IslandPalette.textSecondary)
            .accessibilityLabel("Overlapping speech")
        }
      }
      turn.parts.enumerated().reduce(Text("")) { text, part in
        text + Text(part.offset == 0 ? part.element.text : " " + part.element.text)
          .foregroundColor(
            part.element.isFinal ? IslandPalette.textPrimary : IslandPalette.textSecondary)
      }
      .font(.system(size: 14))
      .lineSpacing(3)
      .multilineTextAlignment(.leading)
      .frame(maxWidth: .infinity, alignment: .leading)
      .fixedSize(horizontal: false, vertical: true)
    }
    .accessibilityElement(children: .combine)
    .environment(\.layoutDirection, turn.isRightToLeft ? .rightToLeft : .leftToRight)
  }
}

struct ElapsedTime: View {
  let startedAt: Date?

  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      Text(
        IslandLayout.elapsedLabel(
          seconds: startedAt.map { context.date.timeIntervalSince($0) } ?? 0)
      )
      .font(.system(size: 13, weight: .semibold).monospacedDigit())
      .foregroundStyle(IslandPalette.textPrimary)
      .lineLimit(1)
      .fixedSize()
    }
    .accessibilityLabel("Elapsed time")
  }
}

/// Hover lifts the button onto a raised fill, pressing deepens it, and keyboard focus rings it.
private struct IslandButtonStyle: ButtonStyle {
  let isOn: Bool
  let isHovered: Bool

  func makeBody(configuration: Configuration) -> some View {
    IslandButtonBody(configuration: configuration, isOn: isOn, isHovered: isHovered)
  }
}

private struct IslandButtonBody: View {
  let configuration: ButtonStyleConfiguration
  let isOn: Bool
  let isHovered: Bool
  @Environment(\.isFocused) private var isFocused

  var body: some View {
    configuration.label
      .background(
        Circle().fill(
          configuration.isPressed
            ? IslandPalette.surfacePressed
            : isOn || isHovered ? IslandPalette.surfaceRaised : .clear)
      )
      .overlay(Circle().strokeBorder(IslandPalette.focus, lineWidth: 2).opacity(isFocused ? 1 : 0))
      .scaleEffect(configuration.isPressed ? 0.94 : 1)
  }
}

/// A labeled action for the panel's footer: a quiet capsule that lifts on hover. The destructive
/// one is red text in a red outline and fills red only under the pointer or while pressed.
private struct PanelActionButton: View {
  enum Role {
    case normal
    case destructive
  }

  let title: String
  let systemName: String
  var iconTint: Color? = nil
  var help: String? = nil
  var role = Role.normal
  let action: () -> Void
  @State private var isHovered = false

  var body: some View {
    let color =
      role == .destructive && !isHovered ? IslandPalette.danger : IslandPalette.textPrimary
    Button(action: action) {
      HStack(spacing: 5) {
        Image(systemName: systemName)
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(iconTint ?? color)
        Text(title)
          .font(.system(size: 12, weight: .semibold))
          .foregroundColor(color)
          .lineLimit(1)
          .fixedSize()
      }
      .padding(.horizontal, 10)
      .frame(height: 26)
    }
    .buttonStyle(PanelActionButtonStyle(role: role, isHovered: isHovered))
    .padding(.vertical, 2)
    .contentShape(Rectangle())
    .help(help ?? title)
    .accessibilityLabel(title)
    .onHover { isHovered = $0 }
    .animation(.easeOut(duration: 0.1), value: isHovered)
  }
}

private struct PanelActionButtonStyle: ButtonStyle {
  let role: PanelActionButton.Role
  let isHovered: Bool

  func makeBody(configuration: Configuration) -> some View {
    PanelActionButtonBody(configuration: configuration, role: role, isHovered: isHovered)
  }
}

private struct PanelActionButtonBody: View {
  let configuration: ButtonStyleConfiguration
  let role: PanelActionButton.Role
  let isHovered: Bool
  @Environment(\.isFocused) private var isFocused

  var body: some View {
    let pressed = configuration.isPressed
    let destructive = role == .destructive
    let filled = destructive && (isHovered || pressed)
    configuration.label
      .background(Capsule().fill(fill(pressed: pressed, filled: filled)))
      .overlay {
        if destructive && !filled {
          Capsule().inset(by: 0.75).stroke(IslandPalette.danger.opacity(0.75), lineWidth: 1.5)
        }
      }
      .overlay {
        if isFocused {
          Capsule().strokeBorder(IslandPalette.focus, lineWidth: 2).padding(-3)
        }
      }
      .scaleEffect(pressed ? 0.97 : 1)
      .animation(.easeOut(duration: 0.1), value: pressed)
  }

  private func fill(pressed: Bool, filled: Bool) -> Color {
    if role == .destructive {
      return filled ? IslandPalette.danger.opacity(pressed ? 0.8 : 1) : .clear
    }
    if pressed { return IslandPalette.surfacePressed }
    return isHovered ? IslandPalette.surfaceRaised : IslandPalette.surfaceRest
  }
}

private struct IslandButton: View {
  let systemName: String
  let label: String
  var shortcut: String? = nil
  var isOn = false
  var tint: Color? = nil
  var size: CGFloat = 30
  var onHover: (Bool) -> Void = { _ in }
  let action: () -> Void
  @State private var isHovered = false

  var body: some View {
    Button(action: action) {
      Image(systemName: systemName)
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(
          tint ?? (isOn || isHovered ? IslandPalette.textPrimary : IslandPalette.textSecondary))
        .frame(width: size, height: size)
        .contentShape(Circle())
    }
    .buttonStyle(IslandButtonStyle(isOn: isOn, isHovered: isHovered))
    .help(shortcut.map { "\(label)  \($0)" } ?? label)
    .accessibilityLabel(label)
    .accessibilityAddTraits(isOn ? .isSelected : [])
    .onHover {
      isHovered = $0
      onHover($0)
    }
    .animation(.easeOut(duration: 0.1), value: isHovered)
  }
}

private struct StopButton: View {
  let diameter: CGFloat
  let label: String
  let help: String
  var disabled = false
  var onHover: (Bool) -> Void = { _ in }
  let action: () -> Void
  @State private var isHovered = false

  var body: some View {
    Button(action: action) {
      RoundedRectangle(cornerRadius: diameter * 0.08, style: .continuous)
        .fill(IslandPalette.textPrimary)
        .frame(width: diameter * 0.32, height: diameter * 0.32)
        .frame(width: diameter, height: diameter)
        .background(Circle().fill(isHovered ? IslandPalette.danger : IslandPalette.surfaceRaised))
        .contentShape(Circle())
    }
    .buttonStyle(IslandButtonStyle(isOn: false, isHovered: false))
    .disabled(disabled)
    .opacity(disabled ? 0.4 : 1)
    .help(help)
    .accessibilityLabel(label)
    .onHover {
      isHovered = $0 && !disabled
      onHover($0 && !disabled)
    }
    .animation(.easeOut(duration: 0.1), value: isHovered)
  }
}

struct LevelBars: View {
  let amplitude: Double
  let color: Color
  let bars: Int
  let maxHeight: CGFloat
  var animated = true

  var body: some View {
    TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: !animated)) { timeline in
      let time = timeline.date.timeIntervalSinceReferenceDate
      HStack(spacing: 2) {
        ForEach(0..<bars, id: \.self) { index in
          Capsule(style: .continuous)
            .fill(color)
            .frame(width: 2, height: height(index: index, time: time))
        }
      }
      .frame(maxHeight: .infinity, alignment: .center)
    }
  }

  private func height(index: Int, time: TimeInterval) -> CGFloat {
    let level = min(max(amplitude, 0), 1)
    let center = Double(bars - 1) / 2
    let envelope = 1 - abs(Double(index) - center) / max(center, 1) * 0.4
    let wave = sin(time * 8 + Double(index) * 0.7) * 0.5 + 0.5
    let height = maxHeight * CGFloat((0.25 + level * 0.85) * envelope * (0.45 + wave * 0.55))
    return max(5, min(maxHeight, height))
  }
}
