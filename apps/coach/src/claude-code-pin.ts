/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.310",
  integrity: {
    "darwin-arm64": "sha512-gpzMjDZdcdA2Webuqm9j76exG8yNK/755ZYWbS3MM4vVBlAsm+enEO+hhNt0Mx1VMil28RWetvTO4ZJ3YODVMA==",
    "darwin-x64": "sha512-ZRQ4ZrzE2OOfR+Fx8h+CM4NKh0UiYqlh5TowP7HUhn5KUoYMjoSR/xIhix8ow42X2IDiBy0FjEVaA/Awhu2KAw==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
