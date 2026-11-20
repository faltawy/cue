/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.329",
  integrity: {
    "darwin-arm64": "sha512-SaVFEDYHofgKftJGX8Uf5oa1wG9d2E9QAQqEpSCtiJrt7Ih82Ekn9b4ir0GufgwoOKx5IOv/CnMsXIWRl9vWrg==",
    "darwin-x64": "sha512-nYtGrz5oe/SK8jMKr/JArzrjEBtTqLWlRBlGu6QLXBoXd4PB5Fdj+Nh7Idnf+LD8OwWz1fqXj8zt0HTIUMSvYA==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
