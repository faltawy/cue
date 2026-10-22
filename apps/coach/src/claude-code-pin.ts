/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.308",
  integrity: {
    "darwin-arm64": "sha512-gdtovvM6BKVFG7+dYiEEoZlw4eJqefy9W9K29CNvrGf5/L0cJxN+9GSRJZmLEeAU7SdrvUcwh+EYFEGKdogWxQ==",
    "darwin-x64": "sha512-F3ODpsTc3OG96pK86S2GUH95BfTqg8SO0fycfP6IEjkT8lrP5/IL5ExbnvbAy4TuuPJyVzeUm5Ho3gkytjhUdg==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
