import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { claudeSignedIn } from "./claude-account";

const dir = mkdtempSync(path.join(os.tmpdir(), "coach-claude-account-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function fakeClaude(name: string, script: string): string {
  const file = path.join(dir, name);
  writeFileSync(file, `#!/bin/sh\n${script}\n`);
  chmodSync(file, 0o755);
  return file;
}

describe("claudeSignedIn", () => {
  test("reads Claude Code's auth status, which exits 1 when nobody is signed in", async () => {
    const signedOut = fakeClaude(
      "signed-out",
      `[ "$*" = "auth status --json" ] || exit 2\necho '{"loggedIn": false, "authMethod": "none"}'\nexit 1`,
    );
    const signedIn = fakeClaude(
      "signed-in",
      `[ "$*" = "auth status --json" ] || exit 2\necho '{"loggedIn": true, "authMethod": "claude.ai"}'`,
    );
    expect(await claudeSignedIn(signedOut)).toBe(false);
    expect(await claudeSignedIn(signedIn)).toBe(true);
  });

  test("an answer it can't read is an error, not a signed-out user", async () => {
    const broken = fakeClaude("broken", `echo "unknown command" >&2\nexit 1`);
    await expect(claudeSignedIn(broken)).rejects.toThrow("unknown command");
  });
});
