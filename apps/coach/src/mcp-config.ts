import type { McpClaudeAIProxyServerConfig, McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import { CONNECTOR_PREFIX } from "./guard";

const stringMap = z.record(z.string(), z.string());

const serverSchema = z.union([
  z.object({
    type: z.literal("stdio").optional(),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: stringMap.optional(),
  }),
  z.object({ type: z.literal("http"), url: z.string(), headers: stringMap.optional() }),
  z.object({ type: z.literal("sse"), url: z.string(), headers: stringMap.optional() }),
]);

const connectorSchema = z.object({ type: z.literal("claudeai-proxy"), url: z.string(), id: z.string() });

const configSchema = z.object({ mcpServers: z.record(z.string(), z.union([serverSchema, connectorSchema])) });

export type Connectors = Record<string, McpClaudeAIProxyServerConfig>;

export function parseMcpConfig(json: unknown): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig> = {};
  for (const [name, server] of Object.entries(configSchema.parse(json).mcpServers)) {
    if (server.type === "claudeai-proxy") continue;
    if (name === "meeting") throw new Error('"meeting" is reserved for the coach\'s own tools');
    if (name.startsWith(CONNECTOR_PREFIX)) throw new Error(`"${CONNECTOR_PREFIX}" names are reserved for claude.ai connectors`);
    servers[name] = server;
  }
  return servers;
}

export function parseConnectors(json: unknown): Connectors {
  const connectors: Connectors = {};
  for (const [name, server] of Object.entries(configSchema.parse(json).mcpServers)) {
    if (server.type !== "claudeai-proxy") continue;
    if (!name.startsWith(CONNECTOR_PREFIX)) throw new Error(`claude.ai connector "${name}" must be named ${CONNECTOR_PREFIX}…`);
    connectors[name] = server;
  }
  return connectors;
}

export async function loadMcpConfig(
  path: string | undefined,
): Promise<{ mcpServers: Record<string, McpServerConfig>; connectors: Connectors }> {
  if (!path) return { mcpServers: {}, connectors: {} };
  const json: unknown = await Bun.file(path).json();
  return { mcpServers: parseMcpConfig(json), connectors: parseConnectors(json) };
}
