import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

import { CoachProvider } from "@anlg/assistant/provider";

import { codexAccount } from "./codex-account";
import { CodexClient } from "./codex-client";
import { CodexCode } from "./codex-code";
import {
  codexInput,
  codexToolReferences,
  startCodexSession,
} from "./codex-session";
import { codexFileTools } from "./codex-tools";
import { LlmEventType, runLlm } from "./llm";
import { type RuntimeMessage, RuntimeMessageType } from "./runtime-message";
import { tool } from "./runtime-tool";
import { startCoach } from "./session";
import { MissingConversationError } from "./supervisor";
import { text } from "./tool-result";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const home = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "cue-codex-test-")),
  );
  directories.push(home);
  const executable = path.join(home, "codex");
  const source = await fs.readFile(
    path.join(import.meta.dir, "fixtures/codex-peer.mjs"),
    "utf8",
  );
  await fs.writeFile(
    executable,
    source.replace("#!/usr/bin/env bun", `#!${process.execPath}`),
    { mode: 0o700 },
  );
  return { home, executable };
}

async function turn(messages: AsyncIterator<RuntimeMessage>) {
  const events: RuntimeMessage[] = [];
  for (;;) {
    const next = await messages.next();
    if (next.done) throw new Error("Turn ended without a result");
    events.push(next.value);
    if (next.value.type === RuntimeMessageType.Result) return events;
  }
}

test("Codex streams host tool output, rejects native/unknown tools, and preserves thread usage across turns", async () => {
  const options = await fixture();
  const session = startCodexSession({
    ...options,
    prompt: "Coach",
    tools: [
      tool("echo", "Read the meeting", { text: z.string() }, async (input) =>
        text(input.text),
      ),
    ],
  });
  const messages = session.messages[Symbol.asyncIterator]();
  try {
    session.ask("read");
    const first = await turn(messages);
    expect(first).toContainEqual({
      type: RuntimeMessageType.Text,
      delta: "from the meeting",
    });
    expect(first).toContainEqual({
      type: RuntimeMessageType.ToolStart,
      id: "echo-1",
      name: "echo",
      input: { text: "from the meeting" },
    });
    expect(first.at(-1)).toMatchObject({
      type: "result",
      subtype: "success",
      session_id: "thread-1",
      usage: {
        input_tokens: 80,
        cache_read_input_tokens: 20,
        output_tokens: 30,
      },
      modelUsage: { "gpt-5.4-mini": { contextWindow: 200000 } },
    });
    session.ask("again");
    expect((await turn(messages)).at(-1)).toMatchObject({
      usage: {
        input_tokens: 80,
        cache_read_input_tokens: 20,
        output_tokens: 30,
      },
    });
  } finally {
    session.close();
  }
  expect(await codexAccount(options.executable, options.home)).toEqual({
    signedIn: true,
    email: "cue@example.com",
  });
});

test("Codex exposes meeting tools outside its reserved MCP namespace and preserves image results", async () => {
  const options = await fixture();
  const session = startCodexSession({
    ...options,
    prompt: "Call cue_meeting_live_transcript.",
    tools: [
      tool(
        "mcp__meeting__live_transcript",
        "Read the live transcript",
        {},
        async () => ({
          content: [
            { type: "text" as const, text: "Transcript from the meeting" },
            {
              type: "image" as const,
              mimeType: "image/jpeg",
              data: "slide-data",
            },
          ],
        }),
      ),
    ],
  });
  try {
    session.ask("meeting-tool");
    const events = await turn(session.messages[Symbol.asyncIterator]());

    expect(events).toContainEqual({
      type: RuntimeMessageType.ToolStart,
      id: "meeting-1",
      name: "mcp__meeting__live_transcript",
      input: {},
    });
    expect(events).toContainEqual({
      type: RuntimeMessageType.Text,
      delta: "Transcript from the meeting",
    });
    expect(events.at(-1)).toMatchObject({
      type: "result",
      subtype: "success",
    });
  } finally {
    session.close();
  }
});

test("Codex prompts and generated requests use the exposed MCP tool names", () => {
  expect(
    codexToolReferences(
      "Call mcp__meeting__live_transcript and mcp__records__get_record.",
    ),
  ).toBe("Call cue_meeting_live_transcript and cue_records_get_record.");
  expect(codexInput("Call mcp__meeting__live_transcript.")).toEqual([
    {
      type: "text",
      text: "Call cue_meeting_live_transcript.",
      text_elements: [],
    },
  ]);
});

test("Codex interruption finishes the active turn and a resumed session can answer again", async () => {
  const options = await fixture();
  const session = startCodexSession({
    ...options,
    prompt: "Coach",
    resume: "thread-1",
  });
  const messages = session.messages[Symbol.asyncIterator]();
  try {
    session.ask("wait");
    expect((await messages.next()).value).toEqual({
      type: "text",
      delta: "Waiting",
    });
    await session.interrupt();
    expect((await turn(messages)).at(-1)).toMatchObject({
      subtype: "interrupted",
      session_id: "thread-1",
    });
    session.ask("Recovered");
    expect(await turn(messages)).toContainEqual({
      type: RuntimeMessageType.Text,
      delta: "Recovered",
    });
  } finally {
    session.close();
  }
});

test("Codex structured LLM calls carry the schema and report the actual resolved model", async () => {
  const options = await fixture();
  const events = await Array.fromAsync(
    runLlm(
      {
        provider: CoachProvider.Codex,
        model: "",
        messages: [
          { role: "user", content: [{ type: "text", text: "title" }] },
        ],
        schema: {
          type: "object",
          properties: { title: { type: "string" } },
          required: ["title"],
          additionalProperties: false,
        },
      },
      new AbortController().signal,
      options.executable,
      { codexHome: options.home },
    ),
  );
  expect(events).toEqual([
    { type: LlmEventType.Text, delta: '{"title":"Review"}' },
    {
      type: LlmEventType.Done,
      model: "gpt-5.4-mini",
      inputTokens: 80,
      outputTokens: 30,
      cachedInputTokens: 20,
      cacheCreationTokens: 0,
      cacheWrite5mTokens: 0,
    },
  ]);
});

test("Codex process failure settles an active turn instead of leaving the coach thinking", async () => {
  const options = await fixture();
  const session = startCodexSession({ ...options, prompt: "Coach" });
  try {
    session.ask("crash");
    const messages = session.messages[Symbol.asyncIterator]();
    expect((await turn(messages)).at(-1)).toMatchObject({
      is_error: true,
      result: "Codex stopped (7).",
    });
    await expect(messages.next()).rejects.toThrow("Codex stopped (7)");
  } finally {
    session.close();
  }
  const client = new CodexClient(options);
  try {
    await client.initialize();
    await expect(client.request("unanswered", {}, 20)).rejects.toThrow(
      "timed out",
    );
  } finally {
    client.close();
    await client.exited;
  }
});

test("Codex project reads cannot traverse symlinks into protected app data or outside the project", async () => {
  const { home } = await fixture();
  const project = path.join(home, "project");
  const secrets = path.join(home, "secret");
  await fs.mkdir(project);
  await fs.mkdir(secrets);
  await fs.writeFile(path.join(project, "notes.txt"), "Meeting is at noon");
  await fs.writeFile(path.join(secrets, "auth.txt"), "sensitive credential");
  await fs.symlink(secrets, path.join(project, "alias"));
  const reads = codexFileTools([project, secrets], [secrets]);
  const read = reads.find((entry) => entry.name === "Read")!;
  expect(
    await read.handler({ file_path: path.join(project, "notes.txt") }),
  ).toEqual(text("Meeting is at noon"));
  for (const file of [
    path.join(project, "alias/auth.txt"),
    path.join(secrets, "auth.txt"),
    path.join(home, "codex"),
  ]) {
    expect(await read.handler({ file_path: file })).toMatchObject({
      isError: true,
    });
  }
  const listing = await reads
    .find((entry) => entry.name === "Glob")!
    .handler({ path: project });
  expect(listing).toEqual(text(path.join(project, "notes.txt")));
});

test("Codex identifies a missing saved thread before emitting a failed answer", async () => {
  const options = await fixture();
  const session = startCodexSession({
    ...options,
    prompt: "Coach",
    resume: "missing",
  });
  try {
    session.ask("Continue");
    await expect(
      session.messages[Symbol.asyncIterator]().next(),
    ).rejects.toBeInstanceOf(MissingConversationError);
  } finally {
    session.close();
  }
});

test("Codex coach resolves relative reads inside the project and refuses its private subtree", async () => {
  const options = await fixture();
  const project = options.home;
  const account = path.join(options.home, "account");
  await fs.mkdir(account);
  await fs.writeFile(path.join(account, "auth.json"), "private login");
  await fs.mkdir(path.join(project, "private"), { recursive: true });
  await fs.writeFile(path.join(project, "notes.txt"), "Meeting is at noon");
  await fs.writeFile(
    path.join(project, "private/secret.txt"),
    "private credential",
  );
  expect(
    await fs.readFile(path.join(project, "private/secret.txt"), "utf8"),
  ).toBe("private credential");
  const db = new Database(":memory:");
  const session = startCoach({
    provider: CoachProvider.Codex,
    pathToCodexExecutable: options.executable,
    codexHome: account,
    project,
    protectedDirs: [path.join(project, "private")],
    db,
  });
  const messages = session.messages[Symbol.asyncIterator]();
  try {
    session.ask("file:notes.txt");
    expect(await turn(messages)).toContainEqual({
      type: RuntimeMessageType.Text,
      delta: "Meeting is at noon",
    });
    session.ask("file:private/secret.txt");
    expect(await turn(messages)).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        id: "file-1",
        isError: true,
      }),
    );
    session.ask("file:account/auth.json");
    expect(await turn(messages)).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        id: "file-1",
        isError: true,
      }),
    );
  } finally {
    session.close();
    db.close();
  }
});

test("Codex setup includes the code-mode host and repairs an incomplete cached runtime", async () => {
  const { home } = await fixture();
  const packageBin = path.join(home, "package/vendor/test-target/bin");
  await fs.mkdir(packageBin, { recursive: true });
  await fs.writeFile(path.join(packageBin, "codex"), "main runtime");
  await fs.writeFile(
    path.join(packageBin, "codex-code-mode-host"),
    "code mode runtime",
  );
  const archive = path.join(home, "fixture.tgz");
  const tar = Bun.spawn(
    ["/usr/bin/tar", "-czf", archive, "-C", home, "package"],
    { stdout: "ignore", stderr: "pipe" },
  );
  expect(await tar.exited).toBe(0);
  const bytes = await fs.readFile(archive);
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const root = path.join(home, "runtime");
  const destination = path.join(root, "test-version");
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(
    path.join(destination, "codex"),
    "incomplete previous installation",
  );
  await fs.writeFile(path.join(destination, ".integrity"), integrity);
  const code = new CodexCode(root, {
    artifact: {
      target: "test-target",
      version: "test-version",
      integrity,
      tarballUrl: "https://registry.npmjs.org/fixture.tgz",
    },
    fetchImpl: async () => new Response(bytes),
  });
  const resolved = await code.resolve();
  expect(await fs.readFile(resolved.executablePath, "utf8")).toBe(
    "main runtime",
  );
  expect(
    await fs.readFile(path.join(destination, "codex-code-mode-host"), "utf8"),
  ).toBe("code mode runtime");
  const offline = new CodexCode(root, {
    artifact: {
      target: "test-target",
      version: "test-version",
      integrity,
      tarballUrl: "https://registry.npmjs.org/fixture.tgz",
    },
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  expect(await offline.resolve()).toEqual(resolved);
});
