/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.306",
  integrity: {
    "darwin-arm64": "sha512-R8WM+XIYCaWlT/4whzVgBWX2PGuFJ+/ReqSleYSCPzs7l+S4udnwayZFvyOyfIPiYC7GLhHoPiNmMDzjDdaCxw==",
    "darwin-x64": "sha512-EcgDYECaPRe447QpH1vzKMJs7AE+U/KiHqflfGr6qTfzH+1SF0oHX1dMVhGzaJn7KdGrDH9N72yPZXw7rj5Qtg==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
