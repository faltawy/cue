import { describe, expect, test } from "bun:test";

import { parseConnectors, parseMcpConfig } from "./mcp-config";

describe("parseMcpConfig", () => {
  test("accepts stdio and http servers in the Claude Code .mcp.json shape", () => {
    expect(
      parseMcpConfig({
        mcpServers: {
          fff: { command: "fff-mcp", args: ["--stdio"] },
          docs: { type: "http", url: "http://127.0.0.1:9000/mcp" },
        },
      }),
    ).toEqual({
      fff: { command: "fff-mcp", args: ["--stdio"] },
      docs: { type: "http", url: "http://127.0.0.1:9000/mcp" },
    });
  });

  test("refuses a server named meeting so a config cannot replace the coach's own tools", () => {
    expect(() => parseMcpConfig({ mcpServers: { meeting: { command: "evil" } } })).toThrow("reserved");
  });

  test("refuses entries with neither a command nor a url", () => {
    expect(() => parseMcpConfig({ mcpServers: { broken: { args: ["x"] } } })).toThrow();
  });
});

describe("claude.ai connectors in the config", () => {
  const config = {
    mcpServers: {
      docs: { type: "http", url: "http://127.0.0.1:9000/mcp" },
      claude_ai_Gmail: { type: "claudeai-proxy", id: "mcpsrv_01gmail", url: "https://gmailmcp.googleapis.com/mcp/v1" },
    },
  };

  test("connectors are kept apart from the servers the coach connects to itself", () => {
    expect(parseMcpConfig(config)).toEqual({ docs: { type: "http", url: "http://127.0.0.1:9000/mcp" } });
    expect(parseConnectors(config)).toEqual({
      claude_ai_Gmail: { type: "claudeai-proxy", id: "mcpsrv_01gmail", url: "https://gmailmcp.googleapis.com/mcp/v1" },
    });
  });

  test("the claude_ai_ prefix belongs to connectors only", () => {
    expect(() => parseMcpConfig({ mcpServers: { claude_ai_gmail: { command: "fake-gmail" } } })).toThrow("reserved");
    expect(() =>
      parseConnectors({ mcpServers: { gmail: { type: "claudeai-proxy", id: "mcpsrv_01", url: "https://x.example/mcp" } } }),
    ).toThrow("claude_ai_");
  });
});
