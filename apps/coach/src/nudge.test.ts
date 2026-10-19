import { describe, expect, test } from "bun:test";

import type { Hit } from "./detect";
import {
  NUDGE_SYSTEM,
  nudgeLabel,
  nudgeMessage,
  nudgeNote,
  nudgeSystem,
  rememberNote,
  withNudgeNotes,
} from "./nudge";
import { estimateTokens, ONE_SHOT_OVERHEAD_TOKENS } from "./pricing";
import type { TranscriptLine } from "./transcript";

const line = (speaker: string, text: string, startS: number, endS = startS + 4): TranscriptLine => ({
  speaker,
  channel: speaker === "You" ? 0 : 1,
  start_ms: startS * 1_000,
  end_ms: endS * 1_000,
  text,
});

const QUESTION = "Can you Bcc every reply to our CRM, or only new sessions?";
const hit = (lineIndex: number, text = QUESTION): Hit => ({ kind: "question", lineIndex, text });

describe("lightweight nudge prompt", () => {
  test("carries the meeting header, the flagged moment, why, and only the last 3 minutes of lines", () => {
    const lines = [
      line("Omar", "Early agenda chatter about the offsite.", 10),
      line("Sara", "We have around 40 agents and 12 team leads.", 400),
      line("Omar", QUESTION, 560),
    ];
    const message = nudgeMessage({
      context: "Rollout sync · with Omar, Sara",
      hits: [hit(2)],
      why: "open question about Bcc",
      lines,
    });
    expect(message).toBe(
      [
        "Meeting: Rollout sync · with Omar, Sara",
        "Flagged moment:",
        `- a question aimed at the user: "${QUESTION}"`,
        "Flagged because: open question about Bcc",
        "The last 3 minutes:",
        "[06:40] Sara: We have around 40 agents and 12 team leads.",
        `[09:20] Omar: ${QUESTION}`,
      ].join("\n"),
    );
  });

  test("adds the talk-time line before the excerpt once enough has been said to judge the balance", () => {
    const lines = [
      line("You", "So let me walk you through the whole platform end to end.", 300, 420),
      line("Omar", "Okay.", 421, 422),
      line("You", "And then there is the reporting layer too.", 423, 480),
      line("Omar", QUESTION, 481, 490),
    ];
    const message = nudgeMessage({ context: "Discovery call · with Omar", hits: [hit(3)], why: "open question", lines });
    expect(message).toContain(
      "Flagged because: open question\nTalk time, last 3 min: You 95%, Omar 5% · your longest stretch 02:00 · questions you asked: 0\nThe last 3 minutes:\n",
    );
  });

  test("the fixed instructions lead the system prompt byte for byte, then the user's own instructions; no tools are named", () => {
    const system = nudgeSystem("I'm the CTO. Never promise dates.");
    expect(system.startsWith(NUDGE_SYSTEM)).toBe(true);
    expect(system).toEndWith("\nI'm the CTO. Never promise dates.");
    expect(nudgeSystem("")).toBe(NUDGE_SYSTEM);
    expect(nudgeSystem("  \n")).toBe(NUDGE_SYSTEM);
    for (const text of [system, nudgeMessage({ context: "x", hits: [hit(0)], why: "y", lines: [line("Omar", QUESTION, 1)] })]) {
      expect(text).not.toContain("mcp__");
      expect(text).not.toContain("live_transcript");
    }
  });

  test.each([
    ["English", "We need every reply logged in the CRM before the renewal call next week. "],
    ["Arabic", "يعني الفريق كله متعود على الطريقة القديمة، محتاجين وقت شوية قبل ما نغير أي حاجة. "],
  ])("%s worst case stays under 4k input tokens and keeps the newest line", (_, sentence) => {
    const lines = Array.from({ length: 300 }, (_, index) =>
      line(`Speaker ${index % 9}`, `${sentence.repeat(8)}${index}`, 600 + index * 0.5, 600 + index * 0.5 + 0.4),
    );
    const hits = [hit(297, sentence.repeat(20)), hit(298, sentence.repeat(20)), hit(299, sentence.repeat(20))];
    const system = nudgeSystem(sentence.repeat(200));
    const message = nudgeMessage({
      context: `${sentence.repeat(30)} · with ${Array.from({ length: 8 }, (_, index) => `Person ${index}`).join(", ")}`,
      hits,
      why: sentence.repeat(10),
      lines,
    });
    const total = estimateTokens(system) + estimateTokens(message) + ONE_SHOT_OVERHEAD_TOKENS;
    expect(total).toBeLessThanOrEqual(4_000);
    expect(total).toBeGreaterThan(2_500);
    expect(message).toEndWith(`${sentence.repeat(8)}299`);
    expect(system.startsWith(NUDGE_SYSTEM)).toBe(true);
  });
});

describe("nudge notes for the next ask", () => {
  test("a follow-up ask carries the nudges the chat never saw, newest three, each kept short", () => {
    let notes: string[] = [];
    for (const index of [1, 2, 3, 4]) notes = rememberNote(notes, nudgeNote(`Question for you · 14:0${index}`, `Answer ${index}`));
    notes = rememberNote(notes, nudgeNote("Commitment · 14:09", `Omar sends the export\n\nnext week. ${"x".repeat(2_000)}`));
    const prompt = withNudgeNotes(notes, "What did you mean by that?");
    expect(prompt).toStartWith("(Since your last answer, the user also saw these automatic nudges");
    expect(prompt).toEndWith("\n\nWhat did you mean by that?");
    expect(prompt).not.toContain("Answer 1");
    expect(prompt).not.toContain("Answer 2");
    expect(prompt).toContain("- Question for you · 14:03: Answer 3");
    expect(prompt).toContain("- Commitment · 14:09: Omar sends the export next week. x");
    expect(estimateTokens(prompt)).toBeLessThan(400);
  });

  test("without nudges the ask goes through untouched", () => {
    expect(withNudgeNotes([], "What did you mean by that?")).toBe("What did you mean by that?");
  });
});

describe("nudgeLabel", () => {
  test("leads with the most pressing kind", () => {
    expect(nudgeLabel([{ kind: "number", lineIndex: 1, text: "" }, { kind: "question", lineIndex: 2, text: "" }])).toBe(
      "Question for you",
    );
    expect(nudgeLabel([{ kind: "number", lineIndex: 1, text: "" }, { kind: "commitment", lineIndex: 1, text: "" }])).toBe(
      "Commitment",
    );
  });
});
