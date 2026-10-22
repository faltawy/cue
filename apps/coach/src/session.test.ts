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
});
