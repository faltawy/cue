/**
 * Cue's own copy of Claude Code: the SDK's platform package at the SDK
 * version in package.json, verified against npm's SHA-512 integrity for
 * each platform. scripts/claude-code-bump.ts moves all of it together.
 */
export const CLAUDE_CODE_PIN = {
  sdkVersion: "0.3.327",
  integrity: {
    "darwin-arm64": "sha512-n+tQOPqz264l12BAKBcBPBbdB/bmZ2SfyONtEXQufTU6EeCoQMPS58RSt51Cxk5sDUme1hTF0vVAqRPdhq8tFg==",
    "darwin-x64": "sha512-u091X+eQIyqg8BIEYLWJ0o6U3BaivMcf8Im4hI3hti/NGJ6YC5sR+LLEa1RjSIKE+JoOfCxipdCNSKaEI+0d5Q==",
  },
} as const satisfies { sdkVersion: string; integrity: Record<string, `sha512-${string}`> };
