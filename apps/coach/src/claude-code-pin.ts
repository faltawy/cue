/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.325",
  integrity: {
    "darwin-arm64": "sha512-0u8bTug2zH+zWE8CMiFrm/ldmH20uA9B/zhXpI7ATHFJnpPMdwTqE56CFM0m3LOwnNum0jpRn7XV1dn6Pf2pqA==",
    "darwin-x64": "sha512-HD3YRFyM5H5QH2usS/WD6gobk3BEp2jq9dKyrkhAVdQIqFMlrcSrRhGA0i3R1IOLxtPAYkmDGepZ62k1kMOW9Q==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
