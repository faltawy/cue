import { parseArgs } from "node:util";

import { claudeSignedIn } from "./claude-account";
import { CLAUDE_ARGS, claudeCodeFromArgs, type ClaudeCodeStatus } from "./claude-code";
import { signInCommand } from "./sign-in";

const { values } = parseArgs({
  options: {
    "auth-status": { type: "boolean" },
    "sign-in": { type: "boolean" },
    "claude-code-status": { type: "boolean" },
    "update-claude-code": { type: "boolean" },
    "prepare-claude-code": { type: "boolean" },
    "exit-with-stdin": { type: "boolean" },
    ...CLAUDE_ARGS,
  },
});

const { claudeCode, executable } = claudeCodeFromArgs(values);

function statusJson(status: ClaudeCodeStatus) {
  return {
    using: status.using,
    installed: status.installed
      ? {
          executable_path: status.installed.executablePath,
          command_path: status.installed.commandPath,
          version: status.installed.version,
        }
      : null,
    min_version: status.minVersion,
  };
}

if (values["sign-in"]) {
  const exitCode = await Bun.spawn(signInCommand(await executable()), { stdout: "ignore", stderr: "inherit" }).exited;
  if (exitCode !== 0) throw new Error(`couldn't open Terminal to sign in (exit ${exitCode})`);
} else if (values["claude-code-status"]) {
  await Bun.write(Bun.stdout, JSON.stringify(statusJson(await claudeCode.status())));
} else if (values["prepare-claude-code"]) {
  if (values["exit-with-stdin"]) {
    process.stdin.on("close", () => process.exit(0));
    process.stdin.resume();
  }
  try {
    const resolved = await claudeCode.resolve();
    await Bun.write(Bun.stdout, JSON.stringify({ executable_path: resolved.executablePath, source: resolved.source }));
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
} else if (values["update-claude-code"]) {
  const { output, status } = await claudeCode.updateInstalled();
  await Bun.write(Bun.stdout, JSON.stringify({ output, status: statusJson(status) }));
} else {
  await Bun.write(Bun.stdout, JSON.stringify({ signed_in: await claudeSignedIn(await executable()) }));
}
