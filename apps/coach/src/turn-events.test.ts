import { describe, expect, test } from "bun:test";

import { OUTPUT_MAX, toolDetail, toolLabels, TurnTracker } from "./turn-events";

function clock() {
  let now = 1_000;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

const assistant = (content: unknown[], extra: Record<string, unknown> = {}) => ({
  type: "assistant",
  parent_tool_use_id: null,
  session_id: "claude-1",
  message: { content, usage: { input_tokens: 10 } },
  ...extra,
});

const toolResult = (id: string, content: unknown, isError = false, parent: string | null = null) => ({
  type: "user",
  parent_tool_use_id: parent,
  session_id: "claude-1",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] },
});

const result = (subtype: string, extra: Record<string, unknown> = {}) => ({
  type: "result",
  subtype,
  is_error: subtype !== "success",
  usage: { input_tokens: 0, output_tokens: 0 },
  modelUsage: {},
  total_cost_usd: 0,
  ...extra,
});

describe("TurnTracker", () => {
  test("a tool call becomes a start and a finish with its output and how long it took", () => {
    const time = clock();
    const tracker = new TurnTracker(time.now);
    expect(
      tracker.handle(assistant([{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "/work/northwind/README.md" } }])),
    ).toEqual([{
        type: "tool",
        id: "t1",
        name: "Read",
        label: "Read README.md",
        activeLabel: "Reading README.md",
        detail: "/work/northwind/README.md",
      }]);
    time.advance(1_250);
    expect(tracker.handle(toolResult("t1", [{ type: "text", text: "# Northwind\n" }]))).toEqual([
      { type: "tool_result", id: "t1", ok: true, output: "# Northwind", durationMs: 1_250 },
    ]);
    expect(tracker.sessionId).toBe("claude-1");
  });

  test("a failed tool reports its error; long output is clipped", () => {
    const tracker = new TurnTracker();
    tracker.handle(assistant([{ type: "tool_use", id: "t2", name: "Bash", input: { command: "rm -rf /" } }]));
    expect(tracker.handle(toolResult("t2", "Only read-only shell commands are allowed during a meeting.", true))).toMatchObject([
      { type: "tool_result", id: "t2", ok: false, output: "Only read-only shell commands are allowed during a meeting." },
    ]);
    tracker.handle(assistant([{ type: "tool_use", id: "t3", name: "Grep", input: { pattern: "Bcc" } }]));
    const [long] = tracker.handle(toolResult("t3", "x".repeat(OUTPUT_MAX + 50)));
    expect(long?.type === "tool_result" ? long.output?.length : 0).toBe(OUTPUT_MAX + 1);
  });

  test("an MCP tool whose result message is empty shows what the PostToolUse hook saw", () => {
    const tracker = new TurnTracker();
    tracker.handle(assistant([{ type: "tool_use", id: "t4", name: "mcp__clients__brief", input: { client: "wafeq" } }]));
    tracker.hookResult("t4", { content: [{ type: "text", text: "Wafeq · 3 open promises" }] });
    expect(tracker.handle(toolResult("t4", []))).toMatchObject([{ type: "tool_result", id: "t4", output: "Wafeq · 3 open promises" }]);
  });

  test("subagent traffic and unknown results stay out of the timeline; main-thread text streams", () => {
    const tracker = new TurnTracker();
    expect(tracker.handle(toolResult("nobody", "ignored"))).toEqual([]);
    expect(tracker.handle({ ...assistant([{ type: "tool_use", id: "s1", name: "Read", input: {} }]), parent_tool_use_id: "task-1" })).toEqual([]);
    expect(
      tracker.handle({
        type: "stream_event",
        parent_tool_use_id: null,
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "Sara asked about Bcc." } },
      }),
    ).toEqual([{ type: "text", delta: "Sara asked about Bcc." }]);
  });

  test("a failed turn becomes a readable error; an interrupted one does not", () => {
    const tracker = new TurnTracker();
    tracker.beginTurn();
    tracker.handle(assistant([{ type: "text", text: "API Error" }], { error: "rate_limit" }));
    const failed = tracker.finishTurn(result("success", { is_error: true, result: "API Error: request failed" }), {
      interrupted: false,
      stderr: "",
    });
    expect(failed.ok).toBe(false);
    expect(failed.error).toMatchObject({ kind: "rate_limit", title: "Usage limit reached" });

    tracker.beginTurn();
    expect(
      tracker.finishTurn(result("error_during_execution", { errors: ["aborted"] }), { interrupted: true, stderr: "" }).error,
    ).toBeNull();
    expect(tracker.finishTurn(result("success", { result: "fine" }), { interrupted: false, stderr: "" })).toMatchObject({
      ok: true,
      error: null,
    });
  });
});

describe("tool copy", () => {
  test.each([
    ["mcp__meeting__live_transcript", {}, "Read the transcript"],
    ["Grep", { pattern: "wrap_up" }, "Searched for “wrap_up”"],
    ["Grep", { pattern: "[Bb]cc|crm" }, "Searched the project"],
    ["Glob", { pattern: "**/*.ts" }, "Searched files"],
    ["Bash", { command: "git log --oneline -5\nmore" }, "Ran git log --oneline -5"],
    ["mcp__clients__log_promise", {}, "clients · log promise"],
  ] as const)("%s", (name, input, label) => {
    expect(toolLabels(name, input).done).toBe(label);
  });

  test("details show the arguments an MCP tool got, one per line", () => {
    expect(toolDetail("mcp__clients__brief", { client: "wafeq", days: 7, empty: "" })).toBe("client: wafeq\ndays: 7");
    expect(toolDetail("AskUserQuestion", { questions: [] })).toBeNull();
  });
});
