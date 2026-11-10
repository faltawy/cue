/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.322",
  integrity: {
    "darwin-arm64": "sha512-LoKkldW2zkLfaOLQD44mL1Ot4Aup8dBIo356LEeO3v2vF7JVNhMllQIXhhGpbYRz57QaYsGvOe0Kb4SbssHwcg==",
    "darwin-x64": "sha512-rTvLS9G1OzjMIaSXrJglQtmRtVcaRmMbJQC+ND02+atCA463ac7Ty/Wc6tyzBGk8zFFGKWnfAhKtLZTNg91eMg==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
