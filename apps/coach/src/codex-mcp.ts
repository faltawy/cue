import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { record } from "./codex-client";
import type { RuntimeTool } from "./runtime-tool";
import { text } from "./tool-result";

export async function loadCodexMcpTools(
  servers: Record<string, McpServerConfig>,
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  const clients: Client[] = [];
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= (async () => {
      controller.abort();
      signal?.removeEventListener("abort", onAbort);
      await Promise.allSettled(clients.map((client) => client.close()));
    })();
    return closing;
  };
  const onAbort = () => {
    void close();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const tools: RuntimeTool[] = [];
  try {
    for (const [server, config] of Object.entries(servers)) {
      controller.signal.throwIfAborted();
      if (
        server === "meeting" ||
        server.includes("__") ||
        server.startsWith("claude_ai_") ||
        config.type === "sdk"
      ) {
        throw new Error(
          `The ${server} tool connection is not supported by Codex.`,
        );
      }
      const client = new Client(
        { name: "cue", version: "1.0.0" },
        { capabilities: {} },
      );
      clients.push(client);
      const transport =
        config.type === "http"
          ? new StreamableHTTPClientTransport(new URL(config.url), {
              requestInit: {
                headers: config.headers,
                signal: controller.signal,
              },
            })
          : config.type === "sse"
            ? new SSEClientTransport(new URL(config.url), {
                requestInit: {
                  headers: config.headers,
                  signal: controller.signal,
                },
                eventSourceInit: {
                  fetch: (url, init) =>
                    fetch(url, {
                      ...init,
                      headers: {
                        ...Object.fromEntries(new Headers(init?.headers)),
                        ...config.headers,
                      },
                      signal: controller.signal,
                    }),
                },
              })
            : new StdioClientTransport({
                command: config.command,
                args: config.args,
                env: config.env,
                stderr: "ignore",
              });
      const connectTimer = setTimeout(() => {
        void close();
      }, 15_000);
      try {
        await client.connect(transport, {
          signal: controller.signal,
          timeout: 15_000,
        });
      } catch {
        throw new Error(
          `Could not connect to ${server}. Check this tool in AI settings.`,
        );
      } finally {
        clearTimeout(connectTimer);
      }
      const cursors = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor ? { cursor } : undefined, {
          signal: controller.signal,
          timeout: 15_000,
        });
        for (const remote of page.tools) {
          const name = `mcp__${server}__${remote.name}`;
          tools.push({
            name,
            description: remote.description ?? remote.name,
            inputSchema: {},
            jsonSchema: remote.inputSchema,
            options: {
              annotations: {
                readOnlyHint: remote.annotations?.readOnlyHint === true,
              },
            },
            async handler(input, extra) {
              const turnSignal = record(extra).signal;
              const callSignal =
                turnSignal instanceof AbortSignal
                  ? AbortSignal.any([controller.signal, turnSignal])
                  : controller.signal;
              callSignal.throwIfAborted();
              const result = await client.callTool(
                { name: remote.name, arguments: record(input) },
                undefined,
                {
                  signal: callSignal,
                  timeout: config.timeout ?? 60_000,
                },
              );
              const content = Array.isArray(result.content)
                ? result.content.flatMap((item) => {
                    const part = record(item);
                    if (part.type === "text" && typeof part.text === "string")
                      return [{ type: "text" as const, text: part.text }];
                    const resource = record(part.resource);
                    if (
                      part.type === "resource" &&
                      typeof resource.text === "string"
                    )
                      return [{ type: "text" as const, text: resource.text }];
                    return [
                      {
                        type: "text" as const,
                        text: `The tool returned ${String(part.type ?? "non-text")} content that Cue cannot display.`,
                      },
                    ];
                  })
                : [];
              if (result.structuredContent && content.length === 0)
                content.push(
                  ...text(JSON.stringify(result.structuredContent)).content,
                );
              return { content, isError: result.isError === true };
            },
          });
        }
        cursor = page.nextCursor;
        if (cursor && cursors.has(cursor))
          throw new Error(`The ${server} tool list repeated a page.`);
        if (cursor) cursors.add(cursor);
      } while (cursor);
    }
    return { tools, close };
  } catch (error) {
    await close();
    throw error;
  }
}
