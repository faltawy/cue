/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.323",
  integrity: {
    "darwin-arm64": "sha512-hWkXHsSMIv+78duw3mDi0bndCpWquGuMrCX6C7G9LzEtpcd+ZvzI5ZE4E6SwqX1bSy8rxhEg+hVJSTk4ABoxpA==",
    "darwin-x64": "sha512-JHtMk+FBRQPvH046dUIda6s6bza8CRQkaAdy96JwV1zqgi3mtlAg5yXFxPA/QNoiHz5Ul225wCZr9lR7gbwkMg==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
