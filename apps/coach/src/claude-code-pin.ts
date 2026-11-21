/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.330",
  integrity: {
    "darwin-arm64": "sha512-J9nqvcfD2V90O5uoR8At66R51VYtSMKnxSmPc0S4A4F5oX1VbokcpJLXU1yVCOuTtzr/OIHjRr9nn2vKi/S6rQ==",
    "darwin-x64": "sha512-woe+f9qeZYWML5fACibNyth0xMDf22riNRNDryIYuhdteh7IoWrK6zC31cC2MrZRoqDZcPVtfOLND79+iZbrLA==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
