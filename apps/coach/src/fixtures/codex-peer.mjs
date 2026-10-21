#!/usr/bin/env bun
import readline from "node:readline";
if (
  process.env.HOME !== process.cwd() ||
  process.env.CODEX_HOME !== process.cwd() ||
  process.env.CODEX_THREAD_ID ||
  process.env.OPENAI_BASE_URL
)
  throw new Error("Parent runtime configuration leaked");

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const answer = (id, result) => send({ id, result });
const notification = (method, params) =>
  send({ method, params: { threadId: "thread-1", ...params } });
let tool = false;
let meetingTool = false;
let turn = 0;
let pendingText = "";
let schema;

function finish(text) {
  notification("item/agentMessage/delta", { delta: text });
  notification("thread/tokenUsage/updated", {
    tokenUsage: {
      total: { totalTokens: turn * 130 },
      last: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 30 },
      modelContextWindow: 200000,
    },
  });
  notification("turn/completed", {
    turn: { id: `turn-${turn}`, status: "completed" },
  });
}

for await (const line of readline.createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  const { id, method, params } = message;
  if (id === "native-call") {
    if (!message.error) throw new Error("Native operation was not denied");
    send({
      id: "unknown-call",
      method: "item/tool/call",
      params: { tool: "mcp__secret__write", callId: "unknown", arguments: {} },
    });
    continue;
  }
  if (id === "unknown-call") {
    if (message.result?.success !== false)
      throw new Error("Unknown tool was not denied");
    send({
      id: "echo-call",
      method: "item/tool/call",
      params: {
        tool: "echo",
        callId: "echo-1",
        arguments: { text: "from the meeting" },
      },
    });
    continue;
  }
  if (id === "file-call") {
    finish(message.result.contentItems[0].text);
    continue;
  }
  if (id === "echo-call") {
    if (!message.result?.success) throw new Error("Allowed tool failed");
    finish(message.result.contentItems[0].text);
    continue;
  }
  if (id === "meeting-call") {
    if (!message.result?.success) throw new Error("Meeting tool failed");
    finish(message.result.contentItems[0].text);
    continue;
  }
  if (method === "initialize") answer(id, { userAgent: "fixture" });
  if (method === "thread/resume" && params.threadId === "missing") {
    send({
      id,
      error: {
        code: -32600,
        message: "no rollout found for thread id missing",
      },
    });
    continue;
  }
  if (method === "thread/start" || method === "thread/resume") {
    if (params.permissions !== "cue" || params.approvalPolicy !== "never")
      throw new Error("Unsafe thread policy");
    const reserved = params.dynamicTools?.find((entry) =>
      entry.name.startsWith("mcp__"),
    );
    if (reserved) {
      send({
        id,
        error: {
          code: -32600,
          message: `dynamic tool name is reserved: ${reserved.name}`,
        },
      });
      continue;
    }
    tool = params.dynamicTools?.some((entry) => entry.name === "echo") ?? false;
    meetingTool =
      params.dynamicTools?.some(
        (entry) => entry.name === "cue_meeting_live_transcript",
      ) ?? false;
    answer(id, { thread: { id: "thread-1" }, model: "gpt-5.4-mini" });
  }
  if (method === "turn/start") {
    turn++;
    pendingText =
      params.input.find((entry) => entry.type === "text")?.text ?? "";
    schema = params.outputSchema;
    notification("turn/started", { turn: { id: `turn-${turn}` } });
    answer(id, { turn: { id: `turn-${turn}` } });
    if (pendingText === "crash") process.exit(7);
    if (pendingText === "wait") {
      notification("item/agentMessage/delta", { delta: "Waiting" });
      continue;
    }
    if (pendingText.startsWith("file:"))
      send({
        id: "file-call",
        method: "item/tool/call",
        params: {
          tool: "Read",
          callId: "file-1",
          arguments: { file_path: pendingText.slice(5) },
        },
      });
    else if (pendingText === "meeting-tool" && meetingTool)
      send({
        id: "meeting-call",
        method: "item/tool/call",
        params: {
          tool: "cue_meeting_live_transcript",
          callId: "meeting-1",
          arguments: {},
        },
      });
    else if (tool)
      send({
        id: "native-call",
        method: "item/commandExecution/requestApproval",
        params: { command: "cat private" },
      });
    else if (schema) {
      if (schema.properties?.title?.type !== "string")
        throw new Error("Structured schema lost");
      finish('{"title":"Review"}');
    } else finish(pendingText);
  }
  if (method === "turn/interrupt") {
    if (params.turnId !== `turn-${turn}`)
      throw new Error("Wrong turn interrupted");
    answer(id, {});
    notification("turn/completed", {
      turn: { id: `turn-${turn}`, status: "interrupted" },
    });
  }
  if (method === "account/read")
    answer(id, { account: { type: "chatgpt", email: "cue@example.com" } });
}
