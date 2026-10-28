/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.312",
  integrity: {
    "darwin-arm64": "sha512-AVmdMOuoeE3Y9f4wAIPcEAAS0OFaZw1L6l11YuyqfS0B/+DYxkWxS/ZYZ1NbUy57eaIW/vdEgz9Q5M99Pl6ZJw==",
    "darwin-x64": "sha512-Dmxyil+GPzF1WENoFOi1Cx0roSdJA6HewGAfAFvsH5vYrzb6G0REGuoQQ0n3u8i8qFgtl1m/WSl4u5t+MdiHWA==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
