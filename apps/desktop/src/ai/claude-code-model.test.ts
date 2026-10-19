import { generateText, Output, streamText } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@anlg/plugin-coach", () => ({
  commands: { llmEndpoint: vi.fn() },
}));

import {
  buildClaudeRequest,
  type ClaudeCodeDeps,
  createClaudeCodeModel,
} from "./claude-code-model";

type CallOptions = Parameters<typeof buildClaudeRequest>[1];

function ndjson(lines: object[], { split = false } = {}) {
  const text = lines.map((line) => `${JSON.stringify(line)}\n`).join("");
  const chunks = split
    ? [text.slice(0, 7), text.slice(7, 19), text.slice(19)]
    : [text];
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200 },
  );
}

function fakeDeps(response: () => Response | Promise<Response>) {
  const fetch = vi.fn<ClaudeCodeDeps["fetch"]>(async (_url, init) => {
    if (init?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    return response();
  });
  const deps: ClaudeCodeDeps = {
    endpoint: async () => "http://127.0.0.1:5151",
    fetch,
  };
  return { deps, fetch };
}

function sentBody(fetch: ReturnType<typeof fakeDeps>["fetch"]) {
  const init = fetch.mock.calls[0]?.[1];
  return JSON.parse(String(init?.body));
}

const userPrompt = (text: string): CallOptions["prompt"] => [
  { role: "user", content: [{ type: "text", text }] },
];

describe("createClaudeCodeModel", () => {
  it("streams text deltas split across network chunks and reports usage", async () => {
    const { deps, fetch } = fakeDeps(() =>
      ndjson(
        [
          { type: "text", delta: "Hello" },
          { type: "text", delta: ", Sara" },
          { type: "done", inputTokens: 11, outputTokens: 4 },
        ],
        { split: true },
      ),
    );

    const result = streamText({
      model: createClaudeCodeModel("haiku", deps),
      system: "Be brief.",
      prompt: "Greet Sara",
    });

    expect(await result.text).toBe("Hello, Sara");
    expect((await result.usage).outputTokens).toBe(4);
    expect(fetch.mock.calls[0]?.[0]).toBe("http://127.0.0.1:5151/llm");
    expect(sentBody(fetch)).toEqual({
      model: "haiku",
      system: "Be brief.",
      messages: [
        { role: "user", content: [{ type: "text", text: "Greet Sara" }] },
      ],
    });
  });

  it("sends the JSON schema and parses the object that comes back", async () => {
    const { deps, fetch } = fakeDeps(() =>
      ndjson([
        {
          type: "text",
          delta: '{"title":"Acme kickoff","actions":["Send Bcc docs"]}',
        },
        { type: "done", inputTokens: 5, outputTokens: 20 },
      ]),
    );

    const { output } = await generateText({
      model: createClaudeCodeModel("sonnet", deps),
      prompt: "Summarize",
      output: Output.object({
        schema: z.object({ title: z.string(), actions: z.array(z.string()) }),
      }),
    });

    expect(output).toEqual({
      title: "Acme kickoff",
      actions: ["Send Bcc docs"],
    });
    expect(sentBody(fetch).schema).toMatchObject({
      type: "object",
      properties: { title: { type: "string" }, actions: { type: "array" } },
    });
  });

  it("surfaces an error line from the coach as a failed generation", async () => {
    const { deps } = fakeDeps(() =>
      ndjson([
        { type: "text", delta: "partial" },
        { type: "error", message: "not signed in to Claude" },
      ]),
    );

    await expect(
      generateText({
        model: createClaudeCodeModel("sonnet", deps),
        prompt: "Hi",
        maxRetries: 0,
      }),
    ).rejects.toThrow("not signed in to Claude");
  });

  it("treats a stream that ends without done as an error, not a short answer", async () => {
    const { deps } = fakeDeps(() =>
      ndjson([{ type: "text", delta: "half an ans" }]),
    );

    await expect(
      generateText({
        model: createClaudeCodeModel("sonnet", deps),
        prompt: "Hi",
        maxRetries: 0,
      }),
    ).rejects.toThrow("stopped before finishing");
  });

  it("cancelling mid-answer aborts the request to the coach", async () => {
    const controller = new AbortController();
    const { deps, fetch } = fakeDeps(
      () =>
        new Response(
          new ReadableStream({
            start(stream) {
              stream.enqueue(
                new TextEncoder().encode(
                  `${JSON.stringify({ type: "text", delta: "Hel" })}\n`,
                ),
              );
            },
          }),
        ),
    );

    const result = streamText({
      model: createClaudeCodeModel("sonnet", deps),
      prompt: "Hi",
      abortSignal: controller.signal,
    });
    for await (const delta of result.textStream) {
      expect(delta).toBe("Hel");
      controller.abort();
      break;
    }

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});

describe("buildClaudeRequest", () => {
  const options = (
    prompt: CallOptions["prompt"],
    extra: Partial<CallOptions> = {},
  ) => ({
    prompt,
    ...extra,
  });

  it("maps image attachments to base64 images and keeps earlier turns", () => {
    const request = buildClaudeRequest(
      "opus",
      options([
        { role: "system", content: "Rules" },
        { role: "user", content: [{ type: "text", text: "Hi" }] },
        { role: "assistant", content: [{ type: "text", text: "Hello" }] },
        {
          role: "user",
          content: [
            { type: "text", text: "What is this?" },
            {
              type: "file",
              mediaType: "image/png",
              data: new Uint8Array([1, 2, 3]),
            },
            { type: "file", mediaType: "image/jpeg", data: "QUJD" },
          ],
        },
      ]),
    );

    expect(request).toEqual({
      model: "opus",
      system: "Rules",
      messages: [
        { role: "user", content: [{ type: "text", text: "Hi" }] },
        { role: "assistant", content: [{ type: "text", text: "Hello" }] },
        {
          role: "user",
          content: [
            { type: "text", text: "What is this?" },
            { type: "image", mediaType: "image/png", data: "AQID" },
            { type: "image", mediaType: "image/jpeg", data: "QUJD" },
          ],
        },
      ],
    });
  });

  it("refuses tools, tool results and non-image files instead of dropping them", () => {
    const tools: CallOptions["tools"] = [
      {
        type: "function",
        name: "list_meetings",
        inputSchema: { type: "object" },
      },
    ];
    expect(() =>
      buildClaudeRequest("sonnet", options(userPrompt("Hi"), { tools })),
    ).toThrow("tool calling");
    expect(() =>
      buildClaudeRequest(
        "sonnet",
        options([
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "1",
                toolName: "x",
                output: { type: "text", value: "y" },
              },
            ],
          },
        ]),
      ),
    ).toThrow("tool results");
    expect(() =>
      buildClaudeRequest(
        "sonnet",
        options([
          {
            role: "user",
            content: [
              { type: "file", mediaType: "application/pdf", data: "QUJD" },
            ],
          },
        ]),
      ),
    ).toThrow("application/pdf");
    expect(
      buildClaudeRequest("sonnet", options(userPrompt("Hi"))).messages,
    ).toHaveLength(1);
  });
});
