import { describe, expect, test } from "bun:test";

import { isNothing } from "./checkin";

describe("isNothing", () => {
  test("recognises the silent reply, with stray formatting", () => {
    expect(isNothing("NOTHING")).toBe(true);
    expect(isNothing(" **NOTHING**.\n")).toBe(true);
  });

  test("keeps real nudge content", () => {
    expect(isNothing("- They asked about Bcc; nothing in the transcript says NOTHING")).toBe(false);
  });
});
