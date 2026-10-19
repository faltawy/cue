import { describe, expect, test } from "bun:test";

import { assignmentsFrom, type SpeakerContext, type SpeakerHint, speakerLabels, withProviderSpeakers } from "./speakers";
import { toLines, type Word } from "./transcript";

const word = (id: string, start_ms: number, channel: number, speaker_index?: number): Word => ({
  id,
  text: ` ${id}`,
  start_ms,
  end_ms: start_ms + 300,
  channel,
  ...(speaker_index === undefined ? {} : { speaker_index }),
});

const hint = (word_id: string, type: string, value: object): SpeakerHint => ({
  word_id,
  type,
  value: JSON.stringify(value),
});

const context = (overrides: Partial<SpeakerContext> = {}): SpeakerContext => ({
  names: new Map([
    ["me", "Falta"],
    ["sara", "Sara"],
    ["omar", "Omar"],
  ]),
  selfHumanId: "me",
  participantHumanIds: [],
  ...overrides,
});

function speakersOf(words: Word[], hints: SpeakerHint[], ctx = context()) {
  const enriched = withProviderSpeakers(words, hints);
  return toLines(enriched, speakerLabels(enriched, assignmentsFrom(hints, enriched), ctx)).map(
    (line) => `${line.speaker}:${line.text.trim()}`,
  );
}

describe("speaker labels", () => {
  test("diarized remote voices become separate numbered speakers instead of one Them", () => {
    const words = [word("a", 0, 1), word("b", 400, 1), word("c", 800, 0)];
    const hints = [
      hint("a", "provider_speaker_index", { channel: 1, speaker_index: 0 }),
      hint("b", "provider_speaker_index", { channel: 1, speaker_index: 1 }),
    ];

    expect(speakersOf(words, [])).toEqual(["Them:a b", "You:c"]);
    expect(speakersOf(words, hints)).toEqual(["Speaker 1:a", "Speaker 2:b", "You:c"]);
  });

  test("a name assigned to one diarized speaker covers all their words; the other stays numbered", () => {
    const words = [word("a", 0, 1, 0), word("b", 400, 1, 1), word("c", 800, 1, 0)];
    const hints = [hint("a", "user_speaker_assignment", { human_id: "sara" })];

    expect(speakersOf(words, hints)).toEqual(["Sara:a", "Speaker 2:b", "Sara:c"]);
  });

  test("a segment assignment names only its words, and user assignments win over automatic ones", () => {
    const words = [word("a", 0, 1, 0), word("b", 400, 1, 0), word("c", 800, 1, 0)];
    const hints = [
      hint("a", "automatic_speaker_assignment", { human_id: "omar", scope: "speaker", channel: 1, speaker_index: 0 }),
      hint("a", "user_speaker_assignment", { human_id: "sara", scope: "speaker", channel: 1, speaker_index: 0 }),
      hint("c", "user_speaker_assignment", { human_id: "omar", scope: "segment", word_ids: ["c"] }),
    ];

    expect(speakersOf(words, hints)).toEqual(["Sara:a b", "Omar:c"]);
  });

  test("with exactly one other invitee, undiarized remote speech is attributed to them", () => {
    const words = [word("a", 0, 1), word("b", 400, 0)];

    expect(speakersOf(words, [], context({ participantHumanIds: ["me", "sara"] }))).toEqual(["Sara:a", "You:b"]);
    expect(speakersOf(words, [], context({ participantHumanIds: ["me", "sara", "omar"] }))).toEqual([
      "Them:a",
      "You:b",
    ]);
  });

  test("the mic channel stays You even when the user's own human is assigned to it", () => {
    const words = [word("a", 0, 0)];
    const hints = [hint("a", "user_speaker_assignment", { human_id: "me", scope: "speaker", channel: 0, speaker_index: null })];

    expect(speakersOf(words, hints)).toEqual(["You:a"]);
  });
});
