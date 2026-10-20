import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { CLAUDE_CODE_PIN } from "../src/claude-code-pin";
import { CLAUDE_CODE_MIN_VERSION } from "../src/claude-code";
import { applyRelease, PACKAGE_JSON, PIN, pinnedSdkVersion, pinTargets } from "./claude-code-bump";

const packageJson = readFileSync(PACKAGE_JSON, "utf8");
const pin = readFileSync(PIN, "utf8");
const installedSdk: { version: string; claudeCodeVersion: string } = JSON.parse(
  readFileSync(path.join(path.dirname(PACKAGE_JSON), "node_modules/@anthropic-ai/claude-agent-sdk/package.json"), "utf8"),
);

describe("Claude Code pins", () => {
  test("package.json, the installed SDK, Cue's download and the minimum version move together", () => {
    const sdk = pinnedSdkVersion(packageJson);
    expect(installedSdk.version).toBe(sdk);
    expect<string>(CLAUDE_CODE_PIN.sdkVersion).toBe(sdk);
    expect(CLAUDE_CODE_MIN_VERSION).toBe(installedSdk.claudeCodeVersion);
  });

  test("Cue's download for this Mac is the SDK's own platform package", () => {
    const lock = readFileSync(path.join(path.dirname(PACKAGE_JSON), "bun.lock"), "utf8");
    for (const [target, integrity] of Object.entries(CLAUDE_CODE_PIN.integrity)) {
      expect(lock).toContain(`"@anthropic-ai/claude-agent-sdk-${target}@${CLAUDE_CODE_PIN.sdkVersion}", "", { "os": "darwin"`);
      expect(lock).toContain(integrity);
    }
  });

  test("a bump rewrites the SDK, its download version and every platform's integrity, and refuses a missing platform", () => {
    const targets = pinTargets(pin);
    expect(targets).toEqual(["darwin-arm64", "darwin-x64"]);
    const integrity = { "darwin-arm64": "sha512-arm==", "darwin-x64": "sha512-x64==" } as const;
    const next = applyRelease({ packageJson, pin }, { sdkVersion: "9.9.9", integrity });
    expect(pinnedSdkVersion(next.packageJson)).toBe("9.9.9");
    expect(next.pin).toContain(`sdkVersion: "9.9.9"`);
    expect(next.pin).toContain(`"darwin-arm64": "sha512-arm=="`);
    expect(next.pin).toContain(`"darwin-x64": "sha512-x64=="`);
    expect(next.pin).not.toContain(CLAUDE_CODE_PIN.integrity["darwin-arm64"]);
    expect(next.packageJson.replace(`"9.9.9"`, `"${pinnedSdkVersion(packageJson)}"`)).toBe(packageJson);

    expect(() => applyRelease({ packageJson, pin }, { sdkVersion: "9.9.9", integrity: { "darwin-arm64": "sha512-arm==" } })).toThrow(
      "darwin-x64",
    );
  });
});
