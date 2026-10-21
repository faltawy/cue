import { z } from "zod";

import { sessionEnv } from "./env";

const authStatusSchema = z.object({ loggedIn: z.boolean(), email: z.string().optional() });

export type ClaudeAccount = { signedIn: boolean; email?: string };

export async function claudeAccount(claudePath: string): Promise<ClaudeAccount> {
  const child = Bun.spawn([claudePath, "auth", "status", "--json"], {
    env: sessionEnv(process.env),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  await child.exited;
  try {
    const { loggedIn, email } = authStatusSchema.parse(JSON.parse(stdout));
    return email ? { signedIn: loggedIn, email } : { signedIn: loggedIn };
  } catch {
    throw new Error(`couldn't read the Claude sign-in: ${(stderr || stdout).trim() || `exit ${child.exitCode}`}`);
  }
}
