import { afterEach, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadCodexMcpTools } from "./codex-mcp";
import { startCodexSession } from "./codex-session";
import { decide } from "./guard";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "cue-codex-mcp-"));
  directories.push(home);
  const executable = path.join(home, "peer");
  const source = await fs.readFile(
    path.join(import.meta.dir, "fixtures/codex-mcp-peer.mjs"),
    "utf8",
  );
  await fs.writeFile(
    executable,
    source.replace("#!/usr/bin/env bun", `#!${process.execPath}`),
    { mode: 0o700 },
  );
  return { home, executable };
}

test("Codex MCP reads reach the server while writes require the existing per-server grant", async () => {
  const options = await fixture();
  for (const allowed of [false, true]) {
    const session = startCodexSession({
      ...options,
      prompt: "Read the meeting",
      loadTools: () =>
        loadCodexMcpTools({
          records: { command: options.executable, args: ["--mcp"] },
        }),
      authorize(name, input) {
        const verdict = decide(name, input, [], allowed ? ["records"] : []);
        if (!verdict.allow) throw new Error(verdict.reason);
      },
    });
    try {
      session.ask("Update the record, then read it");
      let answer = "";
      for await (const message of session.messages) {
        if (message.type === "text") answer += message.delta;
        if (message.type === "result") {
          expect(message.is_error).toBe(false);
          break;
        }
      }
      expect(answer).toBe(
        allowed
          ? "Stored records: 1; original meeting: Tuesday"
          : "Stored records: 0; original meeting: Tuesday",
      );
    } finally {
      session.close();
    }
  }
});

test("closing MCP connections prevents further tool calls after a successful read", async () => {
  const options = await fixture();
  const controller = new AbortController();
  const loaded = await loadCodexMcpTools(
    { records: { command: options.executable, args: ["--mcp"] } },
    controller.signal,
  );
  const read = loaded.tools.find(
    (entry) => entry.name === "mcp__records__get_record",
  )!;
  expect(await read.handler({})).toEqual({
    content: [
      { type: "text", text: "Stored records: 0; original meeting: Tuesday" },
    ],
    isError: false,
  });
  controller.abort();
  await loaded.close();
  await expect(read.handler({})).rejects.toThrow();
});

test("interrupting a turn cancels its pending MCP request while keeping the connection usable", async () => {
  const options = await fixture();
  const loaded = await loadCodexMcpTools({
    records: { command: options.executable, args: ["--mcp"] },
  });
  const read = loaded.tools.find(
    (entry) => entry.name === "mcp__records__get_record",
  )!;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const pending = read.handler({ wait: true }, { signal: controller.signal });
    expect(await read.handler({})).toMatchObject({
      content: [{ text: "Pending request received" }],
    });
    controller.abort(new Error("stop this turn"));
    await expect(
      Promise.race([
        pending,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("MCP did not cancel")),
            1000,
          );
        }),
      ]),
    ).rejects.toThrow("stop this turn");
    expect(await read.handler({})).toMatchObject({
      content: [{ text: "Request cancelled; original meeting: Tuesday" }],
    });
  } finally {
    clearTimeout(timeout);
    await loaded.close();
  }
});

test.each(["http", "sse"] as const)(
  "%s MCP authenticates discovery and calls without putting credentials in tool metadata",
  async (type) => {
    let events: ReadableStreamDefaultController<Uint8Array> | undefined;
    const encoder = new TextEncoder();
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(request) {
        if (request.headers.get("authorization") !== "Bearer test-secret")
          return new Response("Unauthorized", { status: 401 });
        if (request.method === "GET" && type === "sse") {
          return new Response(
            new ReadableStream({
              start(controller) {
                events = controller;
                controller.enqueue(
                  encoder.encode("event: endpoint\ndata: /messages\n\n"),
                );
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        if (request.method !== "POST")
          return new Response(null, { status: 405 });
        const message = (await request.json()) as {
          id?: number;
          method: string;
          params?: { name: string };
        };
        if (message.id === undefined)
          return new Response(null, { status: 202 });
        const result =
          message.method === "initialize"
            ? {
                protocolVersion: "2025-11-25",
                capabilities: { tools: {} },
                serverInfo: { name: "remote", version: "1" },
              }
            : message.method === "tools/list"
              ? {
                  tools: [
                    {
                      name: "get_meeting",
                      description: "Read meeting",
                      inputSchema: { type: "object", properties: {} },
                    },
                  ],
                }
              : {
                  content: [
                    {
                      type: "text",
                      text:
                        message.params?.name === "get_meeting"
                          ? "Authenticated meeting: Thursday"
                          : "Wrong tool",
                    },
                  ],
                };
        const response = { jsonrpc: "2.0", id: message.id, result };
        if (type === "sse") {
          events!.enqueue(
            encoder.encode(
              `event: message\ndata: ${JSON.stringify(response)}\n\n`,
            ),
          );
          return new Response(null, { status: 202 });
        }
        return Response.json(response);
      },
    });
    let loaded: Awaited<ReturnType<typeof loadCodexMcpTools>> | undefined;
    try {
      loaded = await loadCodexMcpTools({
        remote: {
          type,
          url: `http://127.0.0.1:${server.port}/${type}`,
          headers: { authorization: "Bearer test-secret" },
        },
      });
      const tool = loaded.tools[0]!;
      expect(tool.name).toBe("mcp__remote__get_meeting");
      expect(JSON.stringify(tool)).not.toContain("test-secret");
      expect(await tool.handler({})).toEqual({
        content: [{ type: "text", text: "Authenticated meeting: Thursday" }],
        isError: false,
      });
    } finally {
      await loaded?.close();
      await server.stop(true);
    }
  },
);
