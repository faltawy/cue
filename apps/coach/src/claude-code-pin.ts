/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.318",
  integrity: {
    "darwin-arm64": "sha512-AWoXeDXzAMD3RaA21lWuHvCrKd8xmbTTmKjovninn4j07jheoVSMzFbCFjpp4kk5TdhT36JtWPkAxvjNMbcO8w==",
    "darwin-x64": "sha512-6CkZ5PCdebSY/LePp16sf/HYRtM6zVuxtn8qYICFS5KUZFsjccJJ9swVsOdHXNHi4SWZcSmIFTwoUbfFCzisRw==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
