import { describe, expect, test } from "bun:test";

import { coachPrompt } from "./session";

describe("coachPrompt", () => {
  test("requires transcript evidence and plain uncertainty for meeting claims", () => {
    const prompt = coachPrompt();

    expect(prompt).toContain("mcp__meeting__live_transcript first");
    expect(prompt).toMatch(
      /transcript.{0,120}(unclear|does not contain|cannot confirm)/i,
    );
    expect(prompt).toMatch(/project-specific details/i);
    expect(prompt).toMatch(/focused lookup/i);
    expect(prompt).toMatch(/do not delay an immediate in-call answer/i);
  });

  test("transcript edits require explicit requests and stable evidence", () => {
    const prompt = coachPrompt([], true);

    expect(prompt).toContain("only when the user explicitly asks");
    expect(prompt).toContain("wait until the meeting has ended");
    expect(prompt).toContain("unique existing meeting participant");
    expect(prompt).toContain("ask if the span is unclear");
  });
});
