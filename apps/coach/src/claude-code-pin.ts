/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.328",
  integrity: {
    "darwin-arm64": "sha512-vjBASSSZFNs5M84XONCM4xAJMKPD0E9RtF0UDQ/a1Qqt5L+slNxhSADkH5n0tEM5HJMK7j9DCPi+0FVOBpZr3w==",
    "darwin-x64": "sha512-pkZuDNi16H4yJFo6cS2sw8mFj7m7ESAxV74t2gQ9EFzZOpXbQoJqhPBHNEZJ2q/+kr/3vHUtRc2W6jURA6nS+A==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
