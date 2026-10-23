/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.309",
  integrity: {
    "darwin-arm64": "sha512-qC93iDGEioaXqWsYazcZzNv3hd8d4VHkCFgb+AzvbkCWOzZHnRu1EqF4Iz5kCTLDs4VdMvCa1NkzlUwtTedBVw==",
    "darwin-x64": "sha512-RvP0UOcYxn42c1lgByoMufHaMOH86U2ThGGFupOxBKATY4Q6WJd6M1CukQ/qygfgJ8lcxvK8GOOd3SIny4kQ8Q==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
