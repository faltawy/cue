/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.319",
  integrity: {
    "darwin-arm64": "sha512-rNiAbMbRhgOM2CELsDTIq7q++sFVIZukTkgeswcncGbcX8STIgtf0XaZzKdRXtKK+v9ez+mQn8P4pb2Ka17wGA==",
    "darwin-x64": "sha512-jM730Fl+cFotDnjF9cStIf+Xe57YdfDB3TXaSVVv8uVAXW4xoWFwIj2eDvmsciEEe5UMkKzjVqXu9kR21OrXng==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
