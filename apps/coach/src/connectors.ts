import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { type McpServerStatus, query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

import { sessionEnv } from "./env";

export type FoundConnector = { name: string; id: string; url: string };

const DISPLAY_PREFIX = "claude.ai ";
const POLL_MS = 250;

export function claudeConnectors(statuses: readonly McpServerStatus[]): FoundConnector[] {
  return statuses.flatMap((status) =>
    status.source === "claudeai" && status.config?.type === "claudeai-proxy"
      ? [
          {
            name: status.name.startsWith(DISPLAY_PREFIX) ? status.name.slice(DISPLAY_PREFIX.length) : status.name,
            id: status.config.id,
            url: status.config.url,
          },
        ]
      : [],
  );
}

async function* noPrompt(signal: AbortSignal): AsyncGenerator<SDKUserMessage> {
  await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
}

export async function findConnectors(options: { claudePath: string; timeoutMs: number }): Promise<FoundConnector[]> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "cue-connectors-"));
  const abortController = new AbortController();
  const handle = query({
    prompt: noPrompt(abortController.signal),
    options: {
      cwd,
      settingSources: [],
      env: sessionEnv(process.env),
      tools: [],
      skills: [],
      canUseTool: async () => ({ behavior: "deny", message: "Listing connectors only." }),
      abortController,
      pathToClaudeCodeExecutable: options.claudePath,
    },
  });
  try {
    const deadline = Date.now() + options.timeoutMs;
    for (;;) {
      const found = claudeConnectors(await handle.mcpServerStatus());
      if (found.length > 0 || Date.now() >= deadline) return found;
      await Bun.sleep(POLL_MS);
    }
  } finally {
    abortController.abort();
    handle.close();
    rmSync(cwd, { recursive: true, force: true });
  }
}
