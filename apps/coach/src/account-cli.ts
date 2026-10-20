import path from "node:path";
import { parseArgs } from "node:util";

import { claudeSignedIn } from "./claude-account";
import { signInCommand } from "./sign-in";

const { values } = parseArgs({
  options: {
    "auth-status": { type: "boolean" },
    "sign-in": { type: "boolean" },
    claude: { type: "string" },
  },
});

const claudePath = values.claude ? path.resolve(values.claude) : undefined;

if (values["sign-in"]) {
  const exitCode = await Bun.spawn(signInCommand(claudePath), { stdout: "ignore", stderr: "inherit" }).exited;
  if (exitCode !== 0) throw new Error(`couldn't open Terminal to sign in (exit ${exitCode})`);
} else {
  await Bun.write(Bun.stdout, JSON.stringify({ signed_in: await claudeSignedIn(claudePath) }));
}
