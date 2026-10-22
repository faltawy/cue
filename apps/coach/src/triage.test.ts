import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test";

import { parseTriage, TRIAGE_SYSTEM, triagePrompt } from "./triage";

let log: Mock<typeof console.error>;

beforeEach(() => {
  log = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  log.mockRestore();
});

describe("parseTriage", () => {
  test.each([
    ['{"nudge": true, "why": "Omar asked about Bcc"}', { nudge: true, why: "Omar asked about Bcc" }],
    ['{"nudge": false, "why": "small talk"}', { nudge: false, why: "small talk" }],
    ['```json\n{"nudge": true, "why": "a price"}\n```', { nudge: true, why: "a price" }],
  ])("reads %s", (reply, expected) => {
    expect(parseTriage(reply)).toEqual(expected);
    expect(log).not.toHaveBeenCalled();
  });

  test.each([
    ["prose", "Yes, the user should be nudged."],
    ["truncated JSON", '{"nudge": true, "why": "Omar'],
    ["a string for nudge", '{"nudge": "yes", "why": "Omar asked"}'],
    ["an empty reply", ""],
  ])("treats %s as no nudge and logs it", (_, reply) => {
    expect(parseTriage(reply)).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toContain("triage");
  });
});

describe("triagePrompt", () => {
  const request = {
    context: "Weekly sync with Northwind · with Omar, Sara",
    kinds: ["question" as const, "number" as const],
    lines: [
      { speaker: "Omar", channel: 1, start_ms: 61_000, end_ms: 64_000, text: " Can you Bcc the CRM?" },
      { speaker: "You", channel: 0, start_ms: 65_000, end_ms: 66_000, text: "Let me check." },
    ],
  };

  test("carries only the meeting line, the hit kinds and the window, never the fixed instructions", () => {
    const prompt = triagePrompt(request);
    expect(prompt).toBe(
      "Meeting: Weekly sync with Northwind · with Omar, Sara\nFlagged: question, number\n[01:01] Omar: Can you Bcc the CRM?\n[01:05] You: Let me check.",
    );
    expect(TRIAGE_SYSTEM).toContain('"nudge"');
    expect(TRIAGE_SYSTEM).toContain("transcript may be in any language");
    expect(TRIAGE_SYSTEM).toContain("meaning or language is unclear");
    expect(TRIAGE_SYSTEM).toContain("A missing flagged cue does not mean there is no actionable moment");
    expect(prompt).not.toContain(TRIAGE_SYSTEM.slice(0, 40));
  });

  test("keeps later resolution and an unresolved commitment in the triage window", () => {
    const request = {
      context: "Planning call",
      kinds: ["question", "commitment"] as const,
      lines: [
        {
          speaker: "Omar",
          channel: 1,
          start_ms: 60_000,
          end_ms: 63_000,
          text: " Can you approve this today?",
        },
        {
          speaker: "You",
          channel: 0,
          start_ms: 64_000,
          end_ms: 67_000,
          text: " Yes, I'll approve it today.",
        },
        {
          speaker: "Leila",
          channel: 1,
          start_ms: 70_000,
          end_ms: 73_000,
          text: " I'll follow up on the proposal.",
        },
      ],
    };

    const prompt = triagePrompt(request);

    expect(prompt).toContain("Omar: Can you approve this today?");
    expect(prompt).toContain("You: Yes, I'll approve it today.");
    expect(prompt).toContain("Leila: I'll follow up on the proposal.");
    expect(TRIAGE_SYSTEM).toMatch(
      /later lines.{0,80}(resolve|answer)|(?:resolve|answer).{0,80}later lines/i,
    );
  });
});
