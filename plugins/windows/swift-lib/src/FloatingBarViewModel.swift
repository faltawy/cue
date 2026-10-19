import AppKit
import Combine
import Foundation

final class FloatingBarViewModel: ObservableObject {
  static let quietAfter: TimeInterval = 6

  @Published var dictation: FloatingDictationPayload? { didSet { recomputeMode() } }
  @Published var amplitude: Double = 0
  @Published var status: FloatingBarStatus = .recording
  @Published var isExpanded: Bool = false { didSet { recomputeMode() } }
  @Published var isPeeking: Bool = false { didSet { recomputeMode() } }
  @Published var isQuiet: Bool = true { didSet { recomputeMode() } }
  @Published var liveCaptionToggleVisible: Bool = false { didSet { recomputeMode() } }
  @Published var title: String = "Live transcript"
  @Published private(set) var transcriptBubbles: [FloatingTranscriptBubblePayload] = []
  @Published private(set) var caption: LiveCaption?
  @Published var transcriptNotice: String?
  @Published var startedAt: Date?
  @Published var placement = IslandPlacement(
    screen: IslandScreen(
      frame: NSRect(x: 0, y: 0, width: 1440, height: 900),
      visibleFrame: NSRect(x: 0, y: 0, width: 1440, height: 875)))
  @Published var reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
  @Published private(set) var mode: IslandMode = .collapsed
  @Published var isDragging = false {
    didSet { if isDragging { hoverWork?.cancel(); isPeeking = false } }
  }

  private var sessionId: String?
  private var hoverWork: DispatchWorkItem?
  private var quietWork: DispatchWorkItem?

  var showsCoach: Bool { dictation == nil }

  var captionsEnabled: Bool { dictation == nil && isExpanded }

  func setTranscript(_ bubbles: [FloatingTranscriptBubblePayload], now: Date = Date()) {
    guard bubbles != transcriptBubbles else { return }
    let previousLast = transcriptBubbles.last
    transcriptBubbles = bubbles
    let caption = LiveCaption.latest(from: bubbles)
    if self.caption != caption { self.caption = caption }
    if let last = bubbles.last, last != previousLast { heardSpeech() }
    recomputeMode()
  }

  func heardSpeech() {
    quietWork?.cancel()
    if isQuiet { isQuiet = false }
    let work = DispatchWorkItem { [weak self] in self?.isQuiet = true }
    quietWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.quietAfter, execute: work)
  }

  func setHovering(_ hovering: Bool) {
    hoverWork?.cancel()
    guard hovering != isPeeking else { return }
    let work = DispatchWorkItem { [weak self] in self?.isPeeking = hovering }
    hoverWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + (hovering ? 0.12 : 0.45), execute: work)
  }

  func peekNow() {
    hoverWork?.cancel()
    isPeeking = true
  }

  func trackRecordingStart(sessionId: String?, startedAtMs: Double?, now: Date = Date()) {
    let key = dictation?.sessionId ?? sessionId
    guard key != self.sessionId || startedAt == nil else { return }
    self.sessionId = key
    startedAt = startedAtMs.map { Date(timeIntervalSince1970: $0 / 1000) } ?? now
  }

  static func mode(
    dictation: Bool, isExpanded: Bool, isPeeking: Bool, captionsEnabled: Bool, isQuiet: Bool,
    hasCaption: Bool
  ) -> IslandMode {
    if dictation {
      return isExpanded ? .open : isPeeking ? .peek : .collapsed
    }
    if isPeeking { return .peek }
    return captionsEnabled && !isQuiet && hasCaption ? .captions : .collapsed
  }

  private func recomputeMode() {
    let next = Self.mode(
      dictation: dictation != nil, isExpanded: isExpanded, isPeeking: isPeeking,
      captionsEnabled: captionsEnabled, isQuiet: isQuiet, hasCaption: caption != nil)
    if mode != next { mode = next }
  }
}
