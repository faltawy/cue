import { describe, expect, test } from "bun:test";

import { signInCommand } from "./sign-in";

describe("signInCommand", () => {
  test("opens Terminal on the bundled Claude Code with /login, quoting a path with spaces and quotes", () => {
    const [, , script] = signInCommand(`/Applications/Cue.app/Contents/MacOS/it's "claude"`);
    expect(script).toBe(
      `tell application "Terminal" to do script "'/Applications/Cue.app/Contents/MacOS/it'\\\\''s \\"claude\\"' /login"`,
    );
  });

  test("falls back to the claude on PATH", () => {
    expect(signInCommand(undefined)[2]).toBe(`tell application "Terminal" to do script "claude /login"`);
  });
});
