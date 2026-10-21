#!/usr/bin/env bun
import readline from "node:readline";

const send = (message) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
const reply = (id, result) => send({ id, result });
const mcp = process.argv.includes("--mcp");
let writes = 0;
let pending = false;
let cancelled = false;
for await (const line of readline.createInterface({ input: process.stdin })) {
  const { id, method, params, result } = JSON.parse(line);
  if (method === "initialize") {
    reply(
      id,
      mcp
        ? {
            protocolVersion: "2025-11-25",
            capabilities: { tools: {} },
            serverInfo: { name: "records", version: "1" },
          }
        : {},
    );
  } else if (mcp && method === "tools/list") {
    reply(
      id,
      params?.cursor === "page-2"
        ? {
            tools: [
              {
                name: "write_record",
                description: "Write",
                inputSchema: {
                  type: "object",
                  properties: { value: { type: "string" } },
                  required: ["value"],
                },
              },
            ],
          }
        : {
            tools: [
              {
                name: "get_record",
                description: "Read",
                inputSchema: {
                  type: "object",
                  properties: { wait: { type: "boolean" } },
                },
              },
            ],
            nextCursor: "page-2",
          },
    );
  } else if (mcp && method === "notifications/cancelled") {
    pending = false;
    cancelled = true;
  } else if (mcp && method === "tools/call") {
    if (params.name === "get_record" && params.arguments.wait) {
      pending = true;
      continue;
    }
    if (params.name === "write_record") {
      if (params.arguments.value !== "kept")
        throw new Error("Tool arguments were lost");
      writes++;
    }
    reply(id, {
      content: [
        {
          type: "text",
          text: pending
            ? "Pending request received"
            : cancelled
              ? "Request cancelled; original meeting: Tuesday"
              : `Stored records: ${writes}; original meeting: Tuesday`,
        },
      ],
    });
  } else if (method === "thread/start") {
    if (
      params.dynamicTools.find(
        (entry) => entry.name === "cue_records_write_record",
      )?.inputSchema.required?.[0] !== "value"
    )
      throw new Error("MCP schema was lost");
    reply(id, { thread: { id: "thread-mcp" }, model: "fixture" });
  } else if (method === "turn/start") {
    reply(id, { turn: { id: "turn-1" } });
    send({
      method: "turn/started",
      params: { threadId: "thread-mcp", turn: { id: "turn-1" } },
    });
    send({
      id: "write",
      method: "item/tool/call",
      params: {
        tool: "cue_records_write_record",
        callId: "write",
        arguments: { value: "kept" },
      },
    });
  } else if (id === "write") {
    send({
      id: "read",
      method: "item/tool/call",
      params: {
        tool: "cue_records_get_record",
        callId: "read",
        arguments: {},
      },
    });
  } else if (id === "read") {
    send({
      method: "item/agentMessage/delta",
      params: { threadId: "thread-mcp", delta: result.contentItems[0].text },
    });
    send({
      method: "turn/completed",
      params: {
        threadId: "thread-mcp",
        turn: { id: "turn-1", status: "completed" },
      },
    });
  }
}
