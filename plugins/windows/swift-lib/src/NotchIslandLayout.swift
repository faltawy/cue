import Cocoa

struct IslandScreen: Equatable {
  let frame: NSRect
  let visibleFrame: NSRect
  let notchWidth: CGFloat
  let notchHeight: CGFloat
  /// The display's UUID, stable across reconnects and restarts (unlike its index or display id).
  let id: String
  let name: String

  var hasNotch: Bool { notchWidth > 0 && notchHeight > 0 }

  init(
    frame: NSRect, visibleFrame: NSRect, notchWidth: CGFloat = 0, notchHeight: CGFloat = 0,
    id: String = "", name: String = ""
  ) {
    self.frame = frame
    self.visibleFrame = visibleFrame
    self.notchWidth = notchWidth
    self.notchHeight = notchHeight
    self.id = id
    self.name = name
  }

  init(
    frame: NSRect, visibleFrame: NSRect, safeAreaTop: CGFloat,
    auxiliaryTopLeftWidth: CGFloat?, auxiliaryTopRightWidth: CGFloat?,
    id: String = "", name: String = ""
  ) {
    let left = auxiliaryTopLeftWidth ?? 0
    let right = auxiliaryTopRightWidth ?? 0
    let width = safeAreaTop > 0 && left > 0 && right > 0 ? max(0, frame.width - left - right) : 0
    self.init(
      frame: frame, visibleFrame: visibleFrame, notchWidth: width,
      notchHeight: width > 0 ? safeAreaTop : 0, id: id, name: name)
  }

  init(_ screen: NSScreen) {
    self.init(
      frame: screen.frame, visibleFrame: screen.visibleFrame,
      safeAreaTop: screen.safeAreaInsets.top,
      auxiliaryTopLeftWidth: screen.auxiliaryTopLeftArea?.width,
      auxiliaryTopRightWidth: screen.auxiliaryTopRightArea?.width,
      id: Self.uuid(of: screen) ?? "", name: screen.localizedName)
  }

  private static func uuid(of screen: NSScreen) -> String? {
    let key = NSDeviceDescriptionKey("NSScreenNumber")
    guard let number = screen.deviceDescription[key] as? NSNumber,
      let uuid = CGDisplayCreateUUIDFromDisplayID(number.uint32Value)?.takeRetainedValue()
    else { return nil }
    return CFUUIDCreateString(nil, uuid) as String
  }
}

/// Which display the island lives on. Stored as one setting string: "camera", "pointer", or a
/// display UUID chosen by dragging the island or in Settings.
enum IslandDisplayChoice: Equatable {
  case camera
  case pointer
  case display(String)

  init(setting: String?) {
    switch setting?.trimmingCharacters(in: .whitespaces) ?? "" {
    case "", "camera": self = .camera
    case "pointer": self = .pointer
    case let id: self = .display(id)
    }
  }

  var setting: String {
    switch self {
    case .camera: return "camera"
    case .pointer: return "pointer"
    case .display(let id): return id
    }
  }
}

struct IslandSnap: Equatable {
  let screenIndex: Int
  let position: LiveCaptionPosition
}

enum IslandMode: Equatable {
  case collapsed
  case captions
  case peek
  case open
}

enum IslandBandContent: Equatable {
  case status
  case quiet
  case header
  case footer
}

struct IslandPlacement: Equatable {
  let screen: IslandScreen
  var position: LiveCaptionPosition = .topCenter
  var captionWidth: CGFloat = LiveCaptionLayout.defaultWidth
  var captionLines: Int = LiveCaptionLayout.defaultLineCount

  var usesNotch: Bool { position == .topCenter && screen.hasNotch }

  var anchorsBottom: Bool {
    switch position {
    case .bottomLeft, .bottomCenter, .bottomRight: return true
    case .topLeft, .topCenter, .topRight: return false
    }
  }
}

enum IslandLayout {
  static let wingWidth: CGFloat = 80
  static let pillWidth: CGFloat = 176
  static let pillHeight: CGFloat = 32
  static let screenMargin: CGFloat = 8
  static let headerHeight: CGFloat = 40
  static let controlsHeight: CGFloat = 46
  static let peekWidth: CGFloat = 420
  static let historyHeight: CGFloat = 148
  /// The transcript's top edge, where older turns fade out as they scroll away.
  static let transcriptTopFade: CGFloat = 20
  static let dictationPreviewHeight: CGFloat = 168
  static let captionFontSize: CGFloat = 15
  static let captionLineHeight: CGFloat = 22
  static let captionTopPadding: CGFloat = 10
  static let captionBottomPadding: CGFloat = 12
  /// About 60 characters of caption text per line, wider than that is hard to follow.
  static let captionTextMaxWidth: CGFloat = 470
  static let topFillet: CGFloat = 8
  static let joinFillet: CGFloat = 10
  static let collapsedRadius: CGFloat = 12
  static let expandedRadius: CGFloat = 18

  static func bandHeight(_ placement: IslandPlacement) -> CGFloat {
    placement.usesNotch ? placement.screen.notchHeight : pillHeight
  }

  static func neckWidth(_ placement: IslandPlacement) -> CGFloat {
    placement.usesNotch ? placement.screen.notchWidth + wingWidth * 2 : pillWidth
  }

  static func neckOuterWidth(_ placement: IslandPlacement) -> CGFloat {
    neckWidth(placement) + (placement.usesNotch ? topFillet * 2 : 0)
  }

  static func captionHeight(lines: Int) -> CGFloat {
    let lines = min(max(lines, LiveCaptionLayout.minLineCount), LiveCaptionLayout.maxLineCount)
    return captionTopPadding + CGFloat(lines) * captionLineHeight + captionBottomPadding
  }

  static func bodySize(for mode: IslandMode, _ placement: IslandPlacement, dictation: Bool)
    -> NSSize
  {
    let captions = min(
      max(placement.captionWidth, LiveCaptionLayout.minWidth), LiveCaptionLayout.maxWidth)
    let size: NSSize
    switch mode {
    case .collapsed:
      return .zero
    case .captions:
      size = NSSize(width: captions, height: captionHeight(lines: placement.captionLines))
    case .peek:
      size = NSSize(
        width: max(captions, peekWidth),
        height: controlsHeight + (dictation ? 0 : headerHeight + historyHeight))
    case .open:
      size = NSSize(width: peekWidth, height: controlsHeight + dictationPreviewHeight)
    }
    return NSSize(
      width: min(
        max(size.width, neckWidth(placement)),
        placement.screen.visibleFrame.width - screenMargin * 2),
      height: size.height)
  }

  /// What the band (the neck under the camera, or the pill elsewhere) shows. Collapsed, captioning
  /// and dictating, it carries the recording status. A meeting's open panel has one footer with
  /// the status and actions, so under the camera the neck goes quiet, and elsewhere the band row
  /// becomes the panel's header when it is on top or its footer when it is at the bottom.
  static func bandContent(for mode: IslandMode, _ placement: IslandPlacement, dictation: Bool)
    -> IslandBandContent
  {
    guard !dictation, mode == .peek || mode == .open else { return .status }
    if placement.usesNotch { return .quiet }
    return placement.anchorsBottom ? .footer : .header
  }

  /// A meeting panel's transcript takes the body's height less the header and footer it holds,
  /// so the panel is the same size wherever the band's row went.
  static func transcriptHeight(_ placement: IslandPlacement) -> CGFloat {
    switch bandContent(for: .peek, placement, dictation: false) {
    case .header: return historyHeight + headerHeight
    case .footer: return historyHeight + controlsHeight
    case .status, .quiet: return historyHeight
    }
  }

  static func size(for mode: IslandMode, _ placement: IslandPlacement, dictation: Bool) -> NSSize {
    let body = bodySize(for: mode, placement, dictation: dictation)
    return NSSize(
      width: max(neckOuterWidth(placement), body.width),
      height: bandHeight(placement) + body.height)
  }

  /// The window never changes size between modes: it is sized for the largest island the
  /// placement can show, and only the island inside it animates.
  static func panelSize(_ placement: IslandPlacement) -> NSSize {
    var size = NSSize.zero
    for mode in [IslandMode.collapsed, .captions, .peek, .open] {
      for dictation in [false, true] {
        let next = self.size(for: mode, placement, dictation: dictation)
        size = NSSize(width: max(size.width, next.width), height: max(size.height, next.height))
      }
    }
    return size
  }

  /// Transparent room around the island inside its window for the panel's drop shadow. Never
  /// added above a top-anchored island, which must stay flush with the screen edge.
  static let shadowMargin: CGFloat = 28

  static func panelFrame(_ placement: IslandPlacement) -> NSRect {
    let island = frame(for: panelSize(placement), placement)
    let m = shadowMargin
    return NSRect(
      x: island.minX - m, y: island.minY - m, width: island.width + m * 2,
      height: island.height + (placement.anchorsBottom ? m * 2 : m))
  }

  /// The part of a window at `panelFrame` the island may occupy, without the shadow margin.
  static func islandArea(_ placement: IslandPlacement, in panelFrame: NSRect) -> NSRect {
    let m = shadowMargin
    return NSRect(
      x: panelFrame.minX + m, y: panelFrame.minY + m, width: panelFrame.width - m * 2,
      height: panelFrame.height - (placement.anchorsBottom ? m * 2 : m))
  }

  /// Where the island of `mode` sits inside a window at `panelFrame`, in the same coordinates.
  static func islandFrame(
    for mode: IslandMode, _ placement: IslandPlacement, dictation: Bool, in panelFrame: NSRect
  ) -> NSRect {
    let panelFrame = islandArea(placement, in: panelFrame)
    let size = self.size(for: mode, placement, dictation: dictation)
    let x: CGFloat
    switch placement.position {
    case .topLeft, .bottomLeft: x = panelFrame.minX
    case .topRight, .bottomRight: x = panelFrame.maxX - size.width
    case .topCenter, .bottomCenter: x = panelFrame.midX - size.width / 2
    }
    let y = placement.anchorsBottom ? panelFrame.minY : panelFrame.maxY - size.height
    return NSRect(x: x, y: y, width: size.width, height: size.height)
  }

  /// The parts of the island that take clicks and hover: the neck and, when open, the body. Away
  /// from the notch the island is one rounded panel, so all of it.
  static func hitRegion(
    for mode: IslandMode, _ placement: IslandPlacement, dictation: Bool, in panelFrame: NSRect
  ) -> [NSRect] {
    let island = islandFrame(for: mode, placement, dictation: dictation, in: panelFrame)
    guard placement.usesNotch else { return [island] }
    let neck = neckFrame(in: island, placement)
    let body = bodySize(for: mode, placement, dictation: dictation)
    guard body.height > 0 else { return [neck] }
    let bodyRect = NSRect(
      x: island.midX - body.width / 2,
      y: placement.anchorsBottom ? island.minY + neck.height : island.minY,
      width: body.width, height: body.height)
    return [neck, bodyRect]
  }

  /// Where a press can start moving the island: the neck, the captions, and the title row of the
  /// expanded panel (its top row). Not the transcript, which scrolls.
  static func dragHandles(
    for mode: IslandMode, _ placement: IslandPlacement, dictation: Bool, in panelFrame: NSRect
  ) -> [NSRect] {
    let island = islandFrame(for: mode, placement, dictation: dictation, in: panelFrame)
    let neck = neckFrame(in: island, placement)
    let band =
      placement.usesNotch
      ? neck : NSRect(x: island.minX, y: neck.minY, width: island.width, height: neck.height)
    let body = bodySize(for: mode, placement, dictation: dictation)
    let bodyRect = NSRect(
      x: island.midX - body.width / 2,
      y: placement.anchorsBottom ? neck.maxY : neck.minY - body.height,
      width: body.width, height: body.height)
    switch mode {
    case .collapsed:
      return [band]
    case .captions:
      return [band, bodyRect]
    case .peek, .open:
      // Dictation's controls sit next to the pill; a meeting's title row is always on top, and
      // is the band itself when the band is on top.
      if bandContent(for: mode, placement, dictation: dictation) == .header { return [band] }
      let height = dictation ? controlsHeight : headerHeight
      let y =
        dictation && placement.anchorsBottom ? bodyRect.minY : bodyRect.maxY - height
      return [band, NSRect(x: bodyRect.minX, y: y, width: bodyRect.width, height: height)]
    }
  }

  static func frame(for size: NSSize, _ placement: IslandPlacement) -> NSRect {
    let screen = placement.screen
    let visible = screen.visibleFrame
    let x: CGFloat
    switch placement.position {
    case .topCenter, .bottomCenter:
      x = (placement.usesNotch ? screen.frame.midX : visible.midX) - size.width / 2
    case .topLeft, .bottomLeft:
      x = visible.minX + screenMargin
    case .topRight, .bottomRight:
      x = visible.maxX - screenMargin - size.width
    }
    let y: CGFloat
    if placement.usesNotch {
      y = screen.frame.maxY - size.height
    } else if placement.anchorsBottom {
      y = visible.minY + screenMargin
    } else {
      y = visible.maxY - screenMargin + 2 - size.height
    }
    return NSRect(x: x, y: y, width: size.width, height: size.height)
  }

  /// The narrow band of an island placed at `frame`: the only part that sits in the menu-bar
  /// line, whatever the width of the captions or expanded panel below it.
  static func neckFrame(in frame: NSRect, _ placement: IslandPlacement) -> NSRect {
    let width = min(neckOuterWidth(placement), frame.width)
    let height = bandHeight(placement)
    return NSRect(
      x: frame.midX - width / 2,
      y: placement.anchorsBottom ? frame.minY : frame.maxY - height,
      width: width, height: height)
  }

  /// The chosen display when it is connected; otherwise the display with the camera notch, then
  /// the main display (always first in `NSScreen.screens`).
  static func screenIndex(
    for screens: [IslandScreen], mouse: NSPoint, choice: IslandDisplayChoice = .camera
  ) -> Int? {
    guard !screens.isEmpty else { return nil }
    switch choice {
    case .display(let id):
      if let index = screens.firstIndex(where: { $0.id == id }) { return index }
    case .pointer:
      if let index = screens.firstIndex(where: { NSMouseInRect(mouse, $0.frame, false) }) {
        return index
      }
      return 0
    case .camera:
      break
    }
    return screens.firstIndex(where: \.hasNotch) ?? 0
  }

  /// Pointer travel before a press on the island becomes a drag; anything shorter is a click.
  static let dragThreshold: CGFloat = 4

  static func isDrag(from start: NSPoint, to current: NSPoint) -> Bool {
    hypot(current.x - start.x, current.y - start.y) >= dragThreshold
  }

  /// Where a dragged island lands: the display under the release point (or the nearest one), at
  /// whichever of its six anchor points is closest. Top centre sits under the camera on a notched
  /// display and under the menu bar elsewhere.
  static func snapTarget(release: NSPoint, screens: [IslandScreen]) -> IslandSnap? {
    guard !screens.isEmpty else { return nil }
    let index =
      screens.firstIndex(where: { NSMouseInRect(release, $0.frame, false) })
      ?? screens.indices.min(by: {
        distance(release, toRect: screens[$0].frame) < distance(release, toRect: screens[$1].frame)
      }) ?? 0
    let visible = screens[index].visibleFrame
    let anchors: [(LiveCaptionPosition, NSPoint)] = [
      (.topCenter, NSPoint(x: visible.midX, y: visible.maxY)),
      (.topLeft, NSPoint(x: visible.minX, y: visible.maxY)),
      (.topRight, NSPoint(x: visible.maxX, y: visible.maxY)),
      (.bottomCenter, NSPoint(x: visible.midX, y: visible.minY)),
      (.bottomLeft, NSPoint(x: visible.minX, y: visible.minY)),
      (.bottomRight, NSPoint(x: visible.maxX, y: visible.minY)),
    ]
    let nearest = anchors.min(by: {
      hypot($0.1.x - release.x, $0.1.y - release.y) < hypot($1.1.x - release.x, $1.1.y - release.y)
    })
    return IslandSnap(screenIndex: index, position: nearest?.0 ?? .topCenter)
  }

  /// The pill that follows the pointer while the island is dragged, keeping the point that was
  /// grabbed under the pointer.
  static func dragFrame(pointer: NSPoint, grabOffset: NSPoint) -> NSRect {
    NSRect(
      x: pointer.x - grabOffset.x, y: pointer.y - grabOffset.y, width: pillWidth,
      height: pillHeight)
  }

  /// The pill-sized rect a released island settles into before it takes its full shape: the neck
  /// of the collapsed island at its new placement.
  static func settleFrame(_ placement: IslandPlacement) -> NSRect {
    let panel = panelFrame(placement)
    let island = islandFrame(for: .collapsed, placement, dictation: false, in: panel)
    return neckFrame(in: island, placement)
  }

  private static func distance(_ point: NSPoint, toRect rect: NSRect) -> CGFloat {
    let dx = max(rect.minX - point.x, 0, point.x - rect.maxX)
    let dy = max(rect.minY - point.y, 0, point.y - rect.maxY)
    return hypot(dx, dy)
  }

  static func elapsedLabel(seconds: TimeInterval) -> String {
    let total = max(0, Int(seconds))
    let hours = total / 3600
    let minutes = (total % 3600) / 60
    let secs = total % 60
    return hours > 0
      ? String(format: "%d:%02d:%02d", hours, minutes, secs)
      : String(format: "%d:%02d", minutes, secs)
  }
}

struct LiveCaption: Equatable {
  /// The speaker turn: the latest run of one speaker's lines. Bubble ids are not part of it, since
  /// a live segment's id changes with every word it gains and again as its words finalize; the
  /// run only ends when someone else speaks, so the caption transitions on a speaker change and a
  /// growing line updates in place.
  var id: String = ""
  let speaker: String
  let text: String
  let isSelf: Bool

  var isRightToLeft: Bool { IslandText.isRightToLeft(text) }

  static func latest(from bubbles: [FloatingTranscriptBubblePayload]) -> LiveCaption? {
    guard let last = bubbles.last else { return nil }
    let run = bubbles.reversed().prefix {
      $0.speakerLabel == last.speakerLabel && $0.isSelf == last.isSelf
    }
    // The whole run, never trimmed here: the caption wraps it from its first word so the lines
    // already on screen keep their breaks as it grows. The live window upstream bounds its length.
    let text = run.reversed()
      .map { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
      .joined(separator: " ")
    guard !text.isEmpty else { return nil }
    return LiveCaption(
      id: "\(last.isSelf ? "self" : "other"):\(last.speakerLabel)",
      speaker: last.speakerLabel, text: text, isSelf: last.isSelf)
  }
}

/// A new speaker's caption replaces the old one without the two ever showing at once: the old
/// line is gone before the new one starts to appear.
enum CaptionMotion {
  static let removal: TimeInterval = 0.06
  static let insertionDelay: TimeInterval = 0.06
  static let insertion: TimeInterval = 0.18
  /// A growing turn's lines move up by one line in this long; with Reduce Motion they jump.
  static let scroll: TimeInterval = 0.22
  /// The fade at the top of a full caption box, as a fraction of a line's height.
  static let topFade: CGFloat = 0.6
}

enum IslandText {
  static func isRightToLeft(_ text: String) -> Bool {
    for scalar in text.unicodeScalars {
      switch scalar.value {
      case 0x0590...0x08FF, 0xFB1D...0xFDFF, 0xFE70...0xFEFF:
        return true
      default:
        if CharacterSet.letters.contains(scalar) { return false }
      }
    }
    return false
  }

  static let captionFont = NSFont.systemFont(ofSize: IslandLayout.captionFontSize, weight: .medium)

  /// Breaks a caption into lines no wider than `width`, only between words; a single word wider
  /// than a whole line is the one thing split inside. Breaking is greedy from the first word, so
  /// as text is added the earlier lines keep their breaks and only the last ones change. The
  /// newest `newestWords` words are split off each line to be drawn brighter, so the eye lands on
  /// what was just said.
  static func wrap(
    _ text: String, width: CGFloat, newestWords: Int = 8,
    measure: (Substring) -> CGFloat = captionWidth
  ) -> [CaptionLine] {
    let space = measure(" ")
    var rows: [[Substring]] = []
    var row: [Substring] = []
    var rowWidth: CGFloat = 0
    for word in text.split(whereSeparator: \.isWhitespace) {
      for piece in pieces(of: word, width: width, measure: measure) {
        let pieceWidth = measure(piece)
        if !row.isEmpty, rowWidth + space + pieceWidth > width {
          rows.append(row)
          row = []
        }
        rowWidth = row.isEmpty ? pieceWidth : rowWidth + space + pieceWidth
        row.append(piece)
      }
    }
    if !row.isEmpty { rows.append(row) }

    let newestFrom = rows.reduce(0) { $0 + $1.count } - newestWords
    var wordIndex = 0
    return rows.enumerated().map { index, words in
      let split = min(max(newestFrom - wordIndex, 0), words.count)
      wordIndex += words.count
      let earlier = words.prefix(split).joined(separator: " ")
      let newest = words.dropFirst(split).joined(separator: " ")
      return CaptionLine(
        index: index, earlier: earlier.isEmpty || newest.isEmpty ? earlier : earlier + " ",
        newest: newest)
    }
  }

  /// A word that fits is one piece; a longer one (a URL, say) is cut where a line fills up.
  private static func pieces(
    of word: Substring, width: CGFloat, measure: (Substring) -> CGFloat
  ) -> [Substring] {
    guard measure(word) > width else { return [word] }
    var pieces: [Substring] = []
    var start = word.startIndex
    var end = word.startIndex
    while end < word.endIndex {
      let next = word.index(after: end)
      if end > start, measure(word[start..<next]) > width {
        pieces.append(word[start..<end])
        start = end
      }
      end = next
    }
    pieces.append(word[start..<end])
    return pieces
  }

  private static let widths = NSCache<NSString, NSNumber>()

  static func captionWidth(_ text: Substring) -> CGFloat {
    let key = String(text) as NSString
    if let cached = widths.object(forKey: key) { return CGFloat(cached.doubleValue) }
    let width = ceil(key.size(withAttributes: [.font: captionFont]).width)
    widths.setObject(NSNumber(value: Double(width)), forKey: key)
    return width
  }
}

/// One wrapped caption line. `index` counts from the caption's first line, so a line keeps its
/// identity while newer lines push it up.
struct CaptionLine: Equatable, Identifiable {
  let index: Int
  let earlier: String
  let newest: String

  var id: Int { index }
  var text: String { earlier + newest }
  var isRightToLeft: Bool { IslandText.isRightToLeft(text) }
}

/// Consecutive transcript lines from one speaker, shown under a single name.
struct TranscriptTurn: Equatable, Identifiable {
  struct Part: Equatable {
    let text: String
    let isFinal: Bool
  }

  /// The turn's position in the transcript. Bubble ids change as words arrive, positions only
  /// move when the live window drops its oldest lines.
  let id: Int
  let speaker: String
  let isSelf: Bool
  let parts: [Part]
  let overlaps: Bool

  var isRightToLeft: Bool { IslandText.isRightToLeft(parts.map(\.text).joined(separator: " ")) }

  static func group(_ bubbles: [FloatingTranscriptBubblePayload]) -> [TranscriptTurn] {
    var turns: [TranscriptTurn] = []
    for bubble in bubbles {
      let text = bubble.text.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else { continue }
      let part = Part(text: text, isFinal: bubble.isFinal)
      let overlaps = bubble.overlapsPrevious || bubble.overlapsNext
      if let last = turns.last, last.speaker == bubble.speakerLabel, last.isSelf == bubble.isSelf {
        turns[turns.count - 1] = TranscriptTurn(
          id: last.id, speaker: last.speaker, isSelf: last.isSelf, parts: last.parts + [part],
          overlaps: last.overlaps || overlaps)
      } else {
        turns.append(
          TranscriptTurn(
            id: turns.count, speaker: bubble.speakerLabel, isSelf: bubble.isSelf, parts: [part],
            overlaps: overlaps))
      }
    }
    return turns
  }
}

/// Where the transcript is scrolled: its offset from the top, its content height and the visible
/// height, in points.
struct TranscriptScroll: Equatable {
  let offset: CGFloat
  let content: CGFloat
  let visible: CGFloat

  var atEnd: Bool { offset + visible >= content - 8 }
}

/// Whether the transcript keeps the newest speech in view. It stops when the reader scrolls up
/// and starts again when they come back to the end; the transcript growing under a reader who
/// scrolled away does not count as either.
struct TranscriptFollow: Equatable {
  private(set) var following = true
  private var last: TranscriptScroll?

  mutating func update(_ scroll: TranscriptScroll) {
    defer { last = scroll }
    if scroll.atEnd {
      following = true
    } else if let last, last.content == scroll.content, scroll.offset < last.offset {
      following = false
    }
  }
}
