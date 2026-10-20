import { describe, expect, test } from "bun:test";

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import { eventsFromMessage, llmQueryOptions, llmRequestSchema, toPromptContent } from "./llm";

const request = (overrides: object = {}) =>
  llmRequestSchema.parse({ messages: [{ role: "user", content: [{ type: "text", text: "Summarize" }] }], ...overrides });

function textDelta(text: string, parent: string | null = null): SDKMessage {
  return {
    type: "stream_event",
    parent_tool_use_id: parent,
    uuid: "00000000-0000-0000-0000-000000000000",
    session_id: "s",
    event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
  } as unknown as SDKMessage;
}

function result(fields: object): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    usage: { input_tokens: 12, output_tokens: 34 },
    ...fields,
  } as unknown as SDKMessage;
}

describe("toPromptContent", () => {
  test("a single user message passes its text and images through unchanged", () => {
    expect(
      toPromptContent([
        {
          role: "user",
          content: [
            { type: "text", text: "Describe" },
            { type: "image", mediaType: "image/png", data: "AAAA" },
          ],
        },
      ]),
    ).toEqual([
      { type: "text", text: "Describe" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
    ]);
  });

  test("earlier turns are folded into one transcript block before the latest message", () => {
    const blocks = toPromptContent([
      { role: "user", content: [{ type: "text", text: "Hi" }] },
      { role: "assistant", content: [{ type: "text", text: "Hello" }] },
      { role: "user", content: [{ type: "text", text: "Title?" }] },
    ]);
    expect(blocks).toEqual([
      {
        type: "text",
        text: "Conversation so far:\n<user>\nHi\n</user>\n<assistant>\nHello\n</assistant>\n\nReply to the latest message.",
      },
      { type: "text", text: "Title?" },
    ]);
  });
});

describe("llmQueryOptions", () => {
  test("runs Claude as a bare model: no tools, MCP, skills, settings or saved session", () => {
    const options = llmQueryOptions(request({ system: "Be brief" }), new AbortController(), "/bin/claude");
    expect(options).toMatchObject({
      systemPrompt: "Be brief",
      tools: [],
      skills: [],
      settingSources: [],
      strictMcpConfig: true,
      mcpServers: {},
      persistSession: false,
      maxTurns: 1,
      pathToClaudeCodeExecutable: "/bin/claude",
    });
    expect(options.outputFormat).toBeUndefined();
  });

  test("short-cache calls write the prompt cache with the 5-minute TTL; others keep Claude Code's default", () => {
    const short = llmQueryOptions(request(), new AbortController(), "/bin/claude", { shortCache: true, effort: "low" });
    expect(short.env?.FORCE_PROMPT_CACHING_5M).toBe("1");
    expect(short.effort).toBe("low");
    expect(short).not.toHaveProperty("shortCache");
    const plain = llmQueryOptions(request(), new AbortController(), "/bin/claude");
    expect(plain.env?.DISABLE_TELEMETRY).toBe("1");
    expect(plain.env).not.toHaveProperty("FORCE_PROMPT_CACHING_5M");
  });

  test("a schema turns on structured output", () => {
    const schema = { type: "object", properties: { title: { type: "string" } } };
    expect(llmQueryOptions(request({ schema }), new AbortController(), "/bin/claude").outputFormat).toEqual({
      type: "json_schema",
      schema,
    });
  });
});

describe("eventsFromMessage", () => {
  test("text deltas stream for plain requests; subagent deltas are ignored", () => {
    expect(eventsFromMessage(textDelta("Hel"), false)).toEqual([{ type: "text", delta: "Hel" }]);
    expect(eventsFromMessage(textDelta("x", "tool-1"), false)).toEqual([]);
    expect(eventsFromMessage(result({}), false)).toEqual([
      { type: "done", inputTokens: 12, outputTokens: 34, cachedInputTokens: 0, cacheCreationTokens: 0, cacheWrite5mTokens: 0 },
    ]);
  });

  test("done reports cache reads and writes, which Claude Code uses even for a bare prompt", () => {
    const cached = result({
      usage: {
        input_tokens: 2,
        output_tokens: 40,
        cache_read_input_tokens: 500,
        cache_creation_input_tokens: 801,
        cache_creation: { ephemeral_5m_input_tokens: 801, ephemeral_1h_input_tokens: 0 },
      },
    });
    expect(eventsFromMessage(cached, false)).toEqual([
      {
        type: "done",
        inputTokens: 2,
        outputTokens: 40,
        cachedInputTokens: 500,
        cacheCreationTokens: 801,
        cacheWrite5mTokens: 801,
      },
    ]);
  });

  test("structured requests emit the parsed object once as JSON text, not the streamed prose", () => {
    expect(eventsFromMessage(textDelta("thinking aloud"), true)).toEqual([]);
    expect(eventsFromMessage(result({ structured_output: { title: "Kickoff" } }), true)).toEqual([
      { type: "text", delta: '{"title":"Kickoff"}' },
      { type: "done", inputTokens: 12, outputTokens: 34, cachedInputTokens: 0, cacheCreationTokens: 0, cacheWrite5mTokens: 0 },
    ]);
  });

  test("failed runs and missing structured output surface as errors", () => {
    expect(eventsFromMessage(result({ subtype: "error_max_turns" }), false)).toEqual([
      { type: "error", message: "the model run ended with error_max_turns" },
    ]);
    expect(eventsFromMessage(result({}), true)).toEqual([
      { type: "error", message: "the model returned no structured output" },
    ]);
  });
});
