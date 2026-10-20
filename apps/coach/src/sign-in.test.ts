import { describe, expect, test } from "bun:test";

import { signInCommand } from "./sign-in";

describe("signInCommand", () => {
  test("opens Terminal on the coach's Claude Code with /login, quoting a path with spaces and quotes", () => {
    const [, , script] = signInCommand(`/Users/me/Library/Caches/Cue/it's "claude"`);
    expect(script).toBe(
      `tell application "Terminal" to do script "'/Users/me/Library/Caches/Cue/it'\\\\''s \\"claude\\"' /login"`,
    );
  });
});
