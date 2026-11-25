/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.332",
  integrity: {
    "darwin-arm64": "sha512-EFqYJyg1zpgQM3NxfOsOLCi2ktm8uYwgSR1DP9D6Z/InlQ0KSBbWAXL/s11itvLTAj6Pn15VeFtNJS7Ehw4xpg==",
    "darwin-x64": "sha512-vHanIaflUZ5OGgkefYjLjUBfQfiduETCqFlnpvh3DjelEdpphDkBvVmYnPLgH1Lx/eAQBLbIwR8z0qry30u8Dw==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
