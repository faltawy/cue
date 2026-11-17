/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.326",
  integrity: {
    "darwin-arm64": "sha512-D3ZbowCMdKNet0YPZlsJxdJUW1t1Q8KLy1BwNd+5eilf18TlCRtWZlm8DrewFLmu/gxBK7gcsq6uysrIVbPyQg==",
    "darwin-x64": "sha512-m8K3Im2S8STdAVBrriuDZyJcnjsu/Vc3476wIOqTAefnCCdtdZ4AHcOcWxt+4KIHE5Vx1qT2qacTRrQBaVVweA==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
