import { parseArgs } from "node:util";

import { CoachProvider, parseProvider } from "@anlg/assistant/provider";

import { claudeAccount } from "./claude-account";
import {
  CLAUDE_ARGS,
  claudeCodeFromArgs,
  type ClaudeCodeStatus,
} from "./claude-code";
import { codexAccount, signInCodex } from "./codex-account";
import { codexCodeFromArgs } from "./codex-code";
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
    provider: { type: "string" },
    codex: { type: "string" },
    "codex-dir": { type: "string" },
    "prepare-codex": { type: "boolean" },
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

if (
  parseProvider(values.provider) === CoachProvider.Codex ||
  values["prepare-codex"]
) {
  const {
    codexCode,
    executable: codexExecutable,
    home,
  } = codexCodeFromArgs(values);
  if (values["exit-with-stdin"]) {
    process.stdin.on("close", () => process.exit(0));
    process.stdin.resume();
  }
  try {
    if (values["sign-in"]) await signInCodex(await codexExecutable(), home);
    else if (values["prepare-codex"]) {
      const resolved = await codexCode.resolve();
      await Bun.write(
        Bun.stdout,
        JSON.stringify({
          executable_path: resolved.executablePath,
          source: "downloaded",
        }),
      );
    } else {
      const account = await codexAccount(await codexExecutable(), home);
      await Bun.write(
        Bun.stdout,
        JSON.stringify({ signed_in: account.signedIn, email: account.email }),
      );
    }
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
} else if (values["sign-in"]) {
  const exitCode = await Bun.spawn(signInCommand(await executable()), {
    stdout: "ignore",
    stderr: "inherit",
  }).exited;
  if (exitCode !== 0)
    throw new Error(`couldn't open Terminal to sign in (exit ${exitCode})`);
} else if (values["claude-code-status"]) {
  await Bun.write(
    Bun.stdout,
    JSON.stringify(statusJson(await claudeCode.status())),
  );
} else if (values["prepare-claude-code"]) {
  if (values["exit-with-stdin"]) {
    process.stdin.on("close", () => process.exit(0));
    process.stdin.resume();
  }
  try {
    const resolved = await claudeCode.resolve();
    await Bun.write(
      Bun.stdout,
      JSON.stringify({
        executable_path: resolved.executablePath,
        source: resolved.source,
      }),
    );
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
} else if (values["update-claude-code"]) {
  const { output, status } = await claudeCode.updateInstalled();
  await Bun.write(
    Bun.stdout,
    JSON.stringify({ output, status: statusJson(status) }),
  );
} else {
  const { signedIn, email } = await claudeAccount(await executable());
  await Bun.write(Bun.stdout, JSON.stringify({ signed_in: signedIn, email }));
}
