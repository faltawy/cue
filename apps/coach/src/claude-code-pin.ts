/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.331",
  integrity: {
    "darwin-arm64": "sha512-PQrn7YTiSV5Bg+ueF2hNvswc+wI7YKC2c32XNedvs6vfMCUUnIlq93VEbZiRY23b+JIVkEm8gb1VhkJTjsYISQ==",
    "darwin-x64": "sha512-dc3iB+CY3jDpKpDpmvYc4V+UKSkudY29iJ62p0s5TK3h+b7Wqa2Hv0bPow0LUs4ZzDUXxEtCEHzk9X29VfLovw==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
