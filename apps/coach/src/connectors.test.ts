import { describe, expect, test } from "bun:test";

import { claudeConnectors } from "./connectors";

describe("claudeConnectors", () => {
  test("lists only the account's claude.ai connectors, not servers configured on this Mac", () => {
    expect(
      claudeConnectors([
        {
          name: "claude.ai Gmail",
          status: "pending",
          source: "claudeai",
          config: { type: "claudeai-proxy", id: "mcpsrv_01gmail", url: "https://gmailmcp.googleapis.com/mcp/v1" },
        },
        {
          name: "claude.ai Gmail (2)",
          status: "connected",
          source: "claudeai",
          config: { type: "claudeai-proxy", id: "mcpsrv_02gmail", url: "https://gmailmcp.googleapis.com/mcp/v1" },
        },
        { name: "fff", status: "connected", source: "user", config: { type: "stdio", command: "fff-mcp" } },
        { name: "expo", status: "needs-auth", source: "project", config: { type: "http", url: "https://mcp.expo.dev/mcp" } },
        {
          name: "claude_ai_Gmail",
          status: "connected",
          source: "dynamic",
          config: { type: "claudeai-proxy", id: "mcpsrv_01gmail", url: "https://gmailmcp.googleapis.com/mcp/v1" },
        },
      ]),
    ).toEqual([
      { name: "Gmail", id: "mcpsrv_01gmail", url: "https://gmailmcp.googleapis.com/mcp/v1" },
      { name: "Gmail (2)", id: "mcpsrv_02gmail", url: "https://gmailmcp.googleapis.com/mcp/v1" },
    ]);
  });
});
