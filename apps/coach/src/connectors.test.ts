import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { claudeConnectors } from "./connectors";

test("connector discovery accepts both runtime cache paths passed by the desktop app", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "cue-connectors-cli-"));
  const executable = path.join(directory, "claude");
  writeFileSync(
    executable,
    `#!/usr/bin/env bun
import { createInterface } from "node:readline";
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.type !== "control_request") continue;
  const response = message.request.subtype === "mcp_status"
    ? { mcpServers: [{ name: "claude.ai Calendar", status: "connected", source: "claudeai", config: { type: "claudeai-proxy", id: "calendar-1", url: "https://calendar.example/mcp" } }] }
    : {};
  console.log(JSON.stringify({ type: "control_response", response: { subtype: "success", request_id: message.request_id, response } }));
}
`,
    { mode: 0o755 },
  );
  const child = Bun.spawn(
    [
      process.execPath,
      path.join(import.meta.dir, "main.ts"),
      "--list-connectors",
      "--claude",
      executable,
      "--claude-dir",
      path.join(directory, "claude-cache"),
      "--codex-dir",
      path.join(directory, "codex-cache"),
    ],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  const deadline = setTimeout(() => child.kill(), 4_000);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code, stderr).toBe(0);
    expect(JSON.parse(stdout)).toEqual([
      {
        name: "Calendar",
        id: "calendar-1",
        url: "https://calendar.example/mcp",
      },
    ]);
  } finally {
    clearTimeout(deadline);
    child.kill();
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("claudeConnectors", () => {
  test("lists only the account's claude.ai connectors, not servers configured on this Mac", () => {
    expect(
      claudeConnectors([
        {
          name: "claude.ai Gmail",
          status: "pending",
          source: "claudeai",
          config: {
            type: "claudeai-proxy",
            id: "mcpsrv_01gmail",
            url: "https://gmailmcp.googleapis.com/mcp/v1",
          },
        },
        {
          name: "claude.ai Gmail (2)",
          status: "connected",
          source: "claudeai",
          config: {
            type: "claudeai-proxy",
            id: "mcpsrv_02gmail",
            url: "https://gmailmcp.googleapis.com/mcp/v1",
          },
        },
        {
          name: "fff",
          status: "connected",
          source: "user",
          config: { type: "stdio", command: "fff-mcp" },
        },
        {
          name: "expo",
          status: "needs-auth",
          source: "project",
          config: { type: "http", url: "https://mcp.expo.dev/mcp" },
        },
        {
          name: "claude_ai_Gmail",
          status: "connected",
          source: "dynamic",
          config: {
            type: "claudeai-proxy",
            id: "mcpsrv_01gmail",
            url: "https://gmailmcp.googleapis.com/mcp/v1",
          },
        },
      ]),
    ).toEqual([
      {
        name: "Gmail",
        id: "mcpsrv_01gmail",
        url: "https://gmailmcp.googleapis.com/mcp/v1",
      },
      {
        name: "Gmail (2)",
        id: "mcpsrv_02gmail",
        url: "https://gmailmcp.googleapis.com/mcp/v1",
      },
    ]);
  });
});
