import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { claudeAccount } from "./claude-account";

const dir = mkdtempSync(path.join(os.tmpdir(), "coach-claude-account-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function fakeClaude(name: string, script: string): string {
  const file = path.join(dir, name);
  writeFileSync(file, `#!/bin/sh\n${script}\n`);
  chmodSync(file, 0o755);
  return file;
}

describe("claudeAccount", () => {
  test("reads Claude Code's auth status, which exits 1 when nobody is signed in", async () => {
    const signedOut = fakeClaude(
      "signed-out",
      `[ "$*" = "auth status --json" ] || exit 2\necho '{"loggedIn": false, "authMethod": "none"}'\nexit 1`,
    );
    const signedIn = fakeClaude(
      "signed-in",
      `[ "$*" = "auth status --json" ] || exit 2\necho '{"loggedIn": true, "authMethod": "claude.ai", "email": "ada@example.com"}'`,
    );
    const noEmail = fakeClaude("no-email", `echo '{"loggedIn": true, "authMethod": "apiKey"}'`);
    expect(await claudeAccount(signedOut)).toEqual({ signedIn: false });
    expect(await claudeAccount(signedIn)).toEqual({ signedIn: true, email: "ada@example.com" });
    expect(await claudeAccount(noEmail)).toEqual({ signedIn: true });
  });

  test("an answer it can't read is an error, not a signed-out user", async () => {
    const broken = fakeClaude("broken", `echo "unknown command" >&2\nexit 1`);
    await expect(claudeAccount(broken)).rejects.toThrow("unknown command");
  });
});
