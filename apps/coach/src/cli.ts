import readline from "node:readline";
import { parseArgs } from "node:util";

import { COACH_ARGS, coachOptionsFromArgs } from "./args";
import { claudeCodeFromArgs } from "./claude-code";
import { codexCodeFromArgs } from "./codex-code";
import type { RuntimeMessage } from "./runtime-message";
import { startCoach } from "./session";

const { values } = parseArgs({
  options: { ...COACH_ARGS, ask: { type: "string", multiple: true } },
});

const scripted = values.ask ?? [];
const options = await coachOptionsFromArgs(values);
const codex = codexCodeFromArgs(values);
const coach = startCoach({
  ...options,
  ...(options.provider === "codex"
    ? { pathToCodexExecutable: await codex.executable(), codexHome: codex.home }
    : {
        pathToClaudeCodeExecutable:
          await claudeCodeFromArgs(values).executable(),
      }),
});

let askedAt = 0;

function render(message: RuntimeMessage) {
  switch (message.type) {
    case "text":
      process.stdout.write(message.delta);
      return;
    case "tool_start":
      process.stderr.write(
        `\n[tool] ${message.name} ${JSON.stringify(message.input).slice(0, 160)}\n`,
      );
      return;
    case "result":
      console.error(
        `\n[done] ${message.subtype} · ${((Date.now() - askedAt) / 1000).toFixed(1)}s`,
      );
      if (values.ask) askNext();
      else prompt.prompt();
      return;
  }
}

const prompt = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "\ncoach> ",
});
prompt.on("line", (line) => {
  const text = line.trim();
  if (!text) return prompt.prompt();
  if (text === "/quit") {
    coach.close();
    process.exit(0);
  }
  askedAt = Date.now();
  coach.ask(text);
});
prompt.on("SIGINT", () => {
  void coach.interrupt();
});

function askNext() {
  const next = scripted.shift();
  if (next === undefined) {
    coach.close();
    process.exit(0);
  }
  console.error(`\ncoach> ${next}`);
  askedAt = Date.now();
  coach.ask(next);
}

if (values.ask) askNext();
else prompt.prompt();
for await (const message of coach.messages) render(message);
process.exit(0);
