import { parseArgs } from "node:util";

import { llmResponse } from "./llm";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--llm-only"),
  options: {
    port: { type: "string", default: "4748" },
    claude: { type: "string" },
    "exit-with-stdin": { type: "boolean", default: false },
  },
});

if (values["exit-with-stdin"]) {
  process.stdin.on("close", () => process.exit(0));
  process.stdin.resume();
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(values.port),
  idleTimeout: 0,
  routes: {
    "/health": () => new Response("ok"),
    "/llm": { POST: (request) => llmResponse(request, values.claude) },
  },
});

console.error(`[llm] http://${server.hostname}:${server.port}`);
