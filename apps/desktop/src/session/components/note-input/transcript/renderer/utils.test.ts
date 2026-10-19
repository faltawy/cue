import { describe, expect, it } from "vitest";

import {
  getActiveLineIndex,
  getSegmentSpeakerColor,
  getSegmentSpeakerSlot,
} from "./utils";

import type { SegmentKey, SegmentWord } from "~/stt/live-segment";

describe("transcript renderer utils", () => {
  it("gives six unidentified remote speakers six different palette slots", () => {
    const slots = Array.from({ length: 6 }, (_, speaker_index) =>
      getSegmentSpeakerSlot({
        channel: "RemoteParty",
        speaker_index,
        speaker_human_id: null,
      }),
    );

    expect(new Set(slots).size).toBe(6);
    expect(slots.every((slot) => slot !== null && slot >= 1 && slot <= 6)).toBe(
      true,
    );
  });

  it("keeps one colour per person wherever they are heard", () => {
    const key: SegmentKey = {
      channel: "MixedCapture",
      speaker_index: null,
      speaker_human_id: "person-1",
    };

    expect(
      getSegmentSpeakerSlot({
        ...key,
        channel: "RemoteParty",
        speaker_index: 3,
      }),
    ).toBe(getSegmentSpeakerSlot(key));
  });

  it("uses a palette token for others and no colour for your own microphone", () => {
    expect(
      getSegmentSpeakerColor({
        channel: "RemoteParty",
        speaker_index: 0,
        speaker_human_id: null,
      }),
    ).toBe("var(--speaker-1)");
    expect(
      getSegmentSpeakerColor({
        channel: "DirectMic",
        speaker_index: 0,
        speaker_human_id: null,
      }),
    ).toBeNull();
  });

  it("finds the active transcript line without building line groups", () => {
    const words: SegmentWord[] = [
      createWord("word-1", "Hello", 100, 400),
      createWord("word-2", "world.", 400, 900),
      createWord("word-3", "Next", 1400, 1600),
      createWord("word-4", "line!", 1600, 2100),
    ];

    expect(getActiveLineIndex(words, 50, 0)).toBeNull();
    expect(getActiveLineIndex(words, 50, 149)).toBeNull();
    expect(getActiveLineIndex(words, 50, 150)).toBe(0);
    expect(getActiveLineIndex(words, 50, 950)).toBe(0);
    expect(getActiveLineIndex(words, 50, 1200)).toBeNull();
    expect(getActiveLineIndex(words, 50, 1450)).toBe(1);
    expect(getActiveLineIndex(words, 50, 2150)).toBe(1);
    expect(getActiveLineIndex(words, 50, 2200)).toBeNull();
  });
});

function createWord(
  id: string,
  text: string,
  startMs: number,
  endMs: number,
): SegmentWord {
  return {
    id,
    text,
    start_ms: startMs,
    end_ms: endMs,
    channel: "MixedCapture",
    is_final: true,
  };
}
