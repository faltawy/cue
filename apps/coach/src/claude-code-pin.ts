/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.302",
  integrity: {
    "darwin-arm64": "sha512-RwuagoGPwd1i6zNeKhIlU3xLnlez/BGE4qEBSmymdNRQxyE5U2wmGtvi0+taWSg4T91oTMzHRuN8HapSk8swiQ==",
    "darwin-x64": "sha512-92aWlLyKYf9L68mAe1s1UQLpHoWXXGH+lzUBGDD1ony9MrkvJk/HSSvn/yYpHvvG1NcOYDqW8ySAIKRzffj23Q==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
