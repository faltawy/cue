import Combine
import Foundation
import XCTest

@testable import swift_lib

/// Drives the island the way the app does: JSON states as Rust sends them, through the coalescer on
/// the main queue, into the view model. The caption's id is what `CaptionLines` keys its view on,
/// so a new id is a replayed speaker-change transition.
final class LiveCaptionTurnTests: XCTestCase {
  private struct Piece {
    let id: String
    let speaker: String
    let text: String
    let startMs: Double
    let endMs: Double
  }

  private static func speaker1(_ id: String, _ text: String, _ start: Double, _ end: Double)
    -> Piece
  {
    Piece(id: id, speaker: "Speaker 1", text: text, startMs: start, endMs: end)
  }

  /// One speaker talking for about two seconds. Live segment ids are
  /// `channel:speaker:human:first:last` (`stable_segment_id` in crates/transcript), so they change
  /// with every word and again when partial words finalize; a pause opens a second segment for the
  /// same speaker.
  private let oneSpeakerTalking: [[Piece]] = [
    [speaker1("1:0:none:start:1200:end:1400", "So", 1200, 1400)],
    [speaker1("1:0:none:start:1200:end:1900", "So I think", 1200, 1900)],
    [speaker1("1:0:none:w1:end:2300", "So I think we", 1200, 2300)],
    [speaker1("1:0:none:w1:w4", "So I think we", 1200, 2300)],
    [speaker1("1:0:none:w1:end:2900", "So I think we should ship", 1200, 2900)],
    [speaker1("1:0:none:w1:w6", "So I think we should ship", 1200, 2900)],
    [
      speaker1("1:0:none:w1:w6", "So I think we should ship", 1200, 2900),
      speaker1("1:0:none:start:4200:end:4500", "it on", 4200, 4500),
    ],
    [
      speaker1("1:0:none:w1:w6", "So I think we should ship", 1200, 2900),
      speaker1("1:0:none:w7:end:5100", "it on Friday, after", 4200, 5100),
    ],
  ]

  func testCaptionKeepsItsIdentityWhileOneSpeakerKeepsTalking() throws {
    let model = FloatingBarViewModel()
    let coalescer = FloatingBarCommandCoalescer { action in
      if case .update(let state) = action, let bubbles = state.transcriptBubbles {
        model.setTranscript(bubbles)
      }
    }
    var captionIds: [String] = []
    let subscription = model.$caption.compactMap { $0?.id }.removeDuplicates()
      .sink { captionIds.append($0) }
    defer { subscription.cancel() }

    for pieces in oneSpeakerTalking {
      coalescer.enqueueUpdate(try state(pieces))
      RunLoop.main.run(until: Date().addingTimeInterval(0.15))
    }

    XCTAssertEqual(model.caption?.text, "So I think we should ship it on Friday, after")
    XCTAssertEqual(
      captionIds.count, 1,
      "one speaker's growing line replayed the speaker-change transition: \(captionIds)")

    let reply = Piece(
      id: "1:1:none:start:5300:end:5600", speaker: "Speaker 2", text: "Sounds good",
      startMs: 5300, endMs: 5600)
    coalescer.enqueueUpdate(try state((oneSpeakerTalking.last ?? []) + [reply]))
    RunLoop.main.run(until: Date().addingTimeInterval(0.15))

    XCTAssertEqual(model.caption?.speaker, "Speaker 2")
    XCTAssertEqual(captionIds.count, 2, "a new speaker transitions exactly once: \(captionIds)")
  }

  private func state(_ pieces: [Piece]) throws -> FloatingBarStatePayload {
    let json: [String: Any] = [
      "amplitude": 0.4, "title": "Weekly sync", "status": "recording", "colorScheme": "dark",
      "opacity": 0.9, "liveCaptionOpacity": 0.9, "liveCaptionWidth": 440,
      "liveCaptionLineCount": 2, "liveCaptionPosition": "topCenter",
      "liveCaptionMinimized": false, "liveCaptionToggleVisible": true, "sessionId": "s1",
      "transcriptBubbles": pieces.map { piece -> [String: Any] in
        [
          "id": piece.id, "speakerLabel": piece.speaker, "text": piece.text, "isSelf": false,
          "isFinal": !piece.id.contains("end:"), "startMs": piece.startMs, "endMs": piece.endMs,
          "overlapsPrevious": false, "overlapsNext": false,
        ]
      },
    ]
    return try JSONDecoder().decode(
      FloatingBarStatePayload.self, from: JSONSerialization.data(withJSONObject: json))
  }
}
