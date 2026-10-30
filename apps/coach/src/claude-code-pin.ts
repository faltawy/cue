/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.314",
  integrity: {
    "darwin-arm64": "sha512-EuJVa9XPNEji/IniFzvkUcRNWG/fmiNpOfz0LN5+MxaB7BRtkgYFqhzXDcgqvRDUtTd2sP+Na3mppyuJtBMeNA==",
    "darwin-x64": "sha512-iEduedfFdJe/c7Hs59PllTbYOa0aESjMWCqdJhGt1tO9uP5TYXQMt7iJ5hJANm98xxYoKbj3g3nZZVd/mqkuGg==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
