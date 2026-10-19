import readline from "node:readline";
import { parseArgs } from "node:util";

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import { COACH_ARGS, coachOptionsFromArgs } from "./args";
import { startCoach } from "./session";

const { values } = parseArgs({
  options: { ...COACH_ARGS, ask: { type: "string", multiple: true } },
});

const scripted = values.ask ?? [];
const coach = startCoach(await coachOptionsFromArgs(values));

let askedAt = 0;

function render(message: SDKMessage) {
  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        console.error(`[coach] ${message.model} in ${message.cwd} · tools: ${message.tools.length} · mcp: ${message.mcp_servers.map((server) => `${server.name}=${server.status}`).join(", ")}`);
      }
      return;
    case "stream_event":
      if (
        message.parent_tool_use_id === null &&
        message.event.type === "content_block_delta" &&
        message.event.delta.type === "text_delta"
      ) {
        process.stdout.write(message.event.delta.text);
      }
      return;
    case "assistant":
      for (const block of message.message.content) {
        if (block.type === "tool_use") {
          process.stderr.write(`\n[tool] ${block.name} ${JSON.stringify(block.input).slice(0, 160)}\n`);
        }
      }
      return;
    case "result":
      console.error(
        `\n[done] ${message.subtype} · ${((Date.now() - askedAt) / 1000).toFixed(1)}s · $${message.total_cost_usd.toFixed(4)}`,
      );
      if (values.ask) {
        askNext();
        return;
      }
      prompt.prompt();
      return;
    default:
      return;
  }
}

const prompt = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "\ncoach> " });
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
