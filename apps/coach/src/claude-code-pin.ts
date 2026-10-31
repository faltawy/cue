/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.316",
  integrity: {
    "darwin-arm64": "sha512-1I1oJ/YGqq4pFQvJqycD2e8pbsUQLLR+DwEzG9jQAGCoSKkxP1TBfHpjSik/0byCixyzpYObrYXPC0PKBIR91g==",
    "darwin-x64": "sha512-gzNncKrID/6yJIKCAuF/pY1kfygQZ4dU0J+MNFl0bU+iQW65ERoIyoghYVfrAQ/gH2fuvnQtWxa8LQNScHgNMA==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
