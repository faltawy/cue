import { parseArgs } from "node:util";

import { createAccess, randomToken, secure, TOKEN_ENV } from "./access";
import { CLAUDE_ARGS, claudeCodeFromArgs } from "./claude-code";
import { llmResponse } from "./llm";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--llm-only"),
  options: {
    port: { type: "string", default: "4748" },
    ...CLAUDE_ARGS,
    "exit-with-stdin": { type: "boolean", default: false },
  },
});

if (values["exit-with-stdin"]) {
  process.stdin.on("close", () => process.exit(0));
  process.stdin.resume();
}

const { executable } = claudeCodeFromArgs(values);
const port = Number(values.port);
const launchToken = process.env[TOKEN_ENV];
delete process.env[TOKEN_ENV];
if (!launchToken) console.error(`[llm] no ${TOKEN_ENV} set; every request will be refused`);
const access = createAccess(launchToken || randomToken(), port);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  idleTimeout: 0,
  routes: secure(access, {
    "/health": () => new Response("ok"),
    "/llm": { POST: (request) => llmResponse(request, executable) },
  }),
});

console.error(`[llm] http://${server.hostname}:${server.port}`);
