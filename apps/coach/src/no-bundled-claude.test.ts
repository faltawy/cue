import { describe, expect, test } from "bun:test";
import path from "node:path";

const repo = path.resolve(import.meta.dir, "../../..");

function filesMentioning(...needles: string[]): string[] {
  const grep = Bun.spawnSync(["git", "grep", "-l", "-F", ...needles.flatMap((needle) => ["-e", needle])], { cwd: repo });
  if (grep.exitCode > 1) throw new Error(grep.stderr.toString());
  return grep.stdout.toString().split("\n").filter(Boolean);
}

describe("the app ships no Claude Code executable", () => {
  test("nothing references the bundled copy or copies the SDK's platform binary", () => {
    expect(filesMentioning(["cue", "coach"].join("-"))).toContain("apps/desktop/src-tauri/tauri.conf.json");
    expect(filesMentioning(["cue", "claude"].join("-"), ["claude-agent-sdk-darwin-arm64", "claude"].join("/"))).toEqual([]);
  });
});
