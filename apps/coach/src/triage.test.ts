import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from "bun:test";

import { estimateTokens } from "@anlg/assistant/pricing";

import { HitKind } from "./detect";
import {
  parseTriage,
  TRIAGE_SYSTEM,
  triagePrompt,
  type TriageRequest,
} from "./triage";

let log: Mock<typeof console.error>;

beforeEach(() => {
  log = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  log.mockRestore();
});

describe("parseTriage", () => {
  test.each([
    [
      '{"nudge": true, "why": "Omar asked about Bcc"}',
      { nudge: true, why: "Omar asked about Bcc" },
    ],
    [
      '{"nudge": false, "why": "small talk"}',
      { nudge: false, why: "small talk" },
    ],
    [
      '```json\n{"nudge": true, "why": "a price"}\n```',
      { nudge: true, why: "a price" },
    ],
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
  const request: TriageRequest = {
    context: "Weekly sync with Northwind · with Omar, Sara",
    kinds: [HitKind.Question, HitKind.Number],
    lines: [
      {
        speaker: "Omar",
        channel: 1,
        start_ms: 61_000,
        end_ms: 64_000,
        text: " Can you Bcc the CRM?",
      },
      {
        speaker: "You",
        channel: 0,
        start_ms: 65_000,
        end_ms: 66_000,
        text: "Let me check.",
      },
    ],
  };

  test("carries only the meeting line, the hit kinds and the window, never the fixed instructions", () => {
    const prompt = triagePrompt(request);
    expect(prompt).toBe(
      "Meeting: Weekly sync with Northwind · with Omar, Sara\nFlagged: question, number\n[01:01] Omar: Can you Bcc the CRM?\n[01:05] You: Let me check.",
    );
    expect(prompt).not.toContain(TRIAGE_SYSTEM.slice(0, 40));
  });

  test("keeps later resolution and an unresolved commitment in the triage window", () => {
    const request: TriageRequest = {
      context: "Planning call",
      kinds: [HitKind.Question, HitKind.Commitment],
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
  });

  test("bounds a long transcript while preserving its newest Spanish line", () => {
    const longRequest: TriageRequest = {
      context: "Planning call",
      kinds: [HitKind.Question],
      lines: [
        {
          speaker: "Omar",
          channel: 1,
          start_ms: 1_000,
          end_ms: 2_000,
          text: `OLDEST ${"earlier planning detail ".repeat(300)}`,
        },
        ...Array.from({ length: 30 }, (_, index) => ({
          speaker: "Sara",
          channel: 1,
          start_ms: (index + 3) * 1_000,
          end_ms: (index + 4) * 1_000,
          text: `Status ${index}: ${"progress update ".repeat(35)}`,
        })),
        {
          speaker: "Leila",
          channel: 1,
          start_ms: 90_000,
          end_ms: 92_000,
          text: "¿Quién puede confirmar la fecha de entrega?",
        },
      ],
    };

    const prompt = triagePrompt(longRequest);

    expect(prompt).toContain(
      "Leila: ¿Quién puede confirmar la fecha de entrega?",
    );
    expect(prompt).not.toContain("OLDEST");
    expect(estimateTokens(prompt)).toBeLessThanOrEqual(1_050);
  });
});
