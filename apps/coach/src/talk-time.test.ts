import { describe, expect, test } from "bun:test";

import { talkStats, talkSummary } from "./talk-time";
import type { TranscriptLine } from "./transcript";

const line = (speaker: string, startS: number, endS: number, text = "words"): TranscriptLine => ({
  speaker,
  channel: speaker === "You" ? 0 : 1,
  start_ms: startS * 1_000,
  end_ms: endS * 1_000,
  text,
});

describe("talkStats", () => {
  test("shares, the user's longest unbroken stretch and their questions, over the last 10 minutes only", () => {
    const lines = [
      line("Omar", 0, 90, "Old agenda talk that falls outside the window."),
      line("You", 400, 460, "So the way it works is this. And that."),
      line("You", 461, 520, "Does that make sense? Any questions so far?"),
      line("Omar", 520, 540, "Sure."),
      line("You", 540, 600, "Then the second part."),
      line("Sara", 600, 660, "Can it work with our CRM?"),
      line("You", 660, 700, "Yes. هل عندكم سؤال؟"),
    ];
    const stats = talkStats(lines);
    expect(stats).toEqual({
      spanMs: 300_000,
      totalMs: 299_000,
      speakers: [
        { speaker: "You", ms: 219_000 },
        { speaker: "Sara", ms: 60_000 },
        { speaker: "Omar", ms: 20_000 },
      ],
      youLongestMs: 120_000,
      youQuestions: 3,
    });
  });

  test("clips a line that started before the window to the window", () => {
    const stats = talkStats([line("Them", 0, 700), line("You", 700, 760)]);
    expect(stats?.speakers).toEqual([
      { speaker: "You", ms: 60_000 },
      { speaker: "Them", ms: 540_000 },
    ]);
  });

  test("returns null while too little has been said to judge balance", () => {
    expect(talkStats([line("You", 0, 20), line("Omar", 20, 50)])).toBeNull();
    expect(talkStats([])).toBeNull();
  });
});

describe("talkSummary", () => {
  test("one compact line: the user first, then others by share, folding the tail into others", () => {
    const stats = talkStats([
      line("You", 0, 300),
      line("Omar", 300, 360),
      line("Sara", 360, 390),
      line("Jo", 390, 400),
      line("Speaker 4", 400, 410),
      line("You", 410, 430, "Right?"),
    ]);
    expect(stats && talkSummary(stats)).toBe(
      "Talk time, last 7 min: You 74%, Omar 14%, Sara 7%, others 5% · your longest stretch 05:00 · questions you asked: 1",
    );
  });
});
