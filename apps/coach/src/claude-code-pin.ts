/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.317",
  integrity: {
    "darwin-arm64": "sha512-SSXvZ04MpfA0hLfGrP9SBTNOgw2p2TsmJAUjr6GA5bM9LVLRLX6pmiIAaTtpaPhslK+zd6Nf5taU/XRldPyUBg==",
    "darwin-x64": "sha512-GAmOMLr3g3nEQDFcYux5u/duNNXMvJxIBjowgAVp7ndPRbTHpv+jU0JVSa9LdvEycT4ssEvTR/R6eqQ1raBKbw==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
