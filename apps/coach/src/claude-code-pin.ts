/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.311",
  integrity: {
    "darwin-arm64": "sha512-pzlXQGLh3pH/oIAliApR79OIkTFTAGpWJpf1HLt5MocWPBxox/aoHVWOKHqbnYnmGrr54LwdG+E4V1boaQzyvA==",
    "darwin-x64": "sha512-xVoQD+ZwScwbPitYBmedm1/j3dUIyyLFB1zgk3q99YQXac6r6wAKR4HP+QTrrEwsQa0slePbE/Ljj/5u2z14nw==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
