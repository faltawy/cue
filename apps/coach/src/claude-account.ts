import { z } from "zod";

import { sessionEnv } from "./env";

const authStatusSchema = z.object({ loggedIn: z.boolean() });

export function claudeExecutable(claudePath: string | undefined): string {
  return claudePath ?? Bun.resolveSync("@anthropic-ai/claude-agent-sdk-darwin-arm64/claude", import.meta.dir);
}

export async function claudeSignedIn(claudePath: string | undefined): Promise<boolean> {
  const child = Bun.spawn([claudeExecutable(claudePath), "auth", "status", "--json"], {
    env: sessionEnv(process.env),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  await child.exited;
  try {
    return authStatusSchema.parse(JSON.parse(stdout)).loggedIn;
  } catch {
    throw new Error(`couldn't read the Claude sign-in: ${(stderr || stdout).trim() || `exit ${child.exitCode}`}`);
  }
}
