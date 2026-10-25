import {
  type Options,
  query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import os from "node:os";
import { z } from "zod";

import { startCodexSession } from "./codex-session";
import { sessionEnv } from "./env";
import { CoachProvider, providerSchema } from "./provider";
import { RuntimeMessageType } from "./runtime-message";
import { cacheWrite5m } from "./usage";

export enum LlmEventType {
  Text = "text",
  Done = "done",
  Error = "error",
}

const imagePart = z.object({
  type: z.literal("image"),
  mediaType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
  data: z.string(),
});
const textPart = z.object({ type: z.literal("text"), text: z.string() });

export const llmRequestSchema = z
  .object({
    provider: providerSchema.default(CoachProvider.Claude),
    model: z.string().optional(),
    system: z.string().optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.array(z.union([textPart, imagePart])),
        }),
      )
      .min(1),
    schema: z.record(z.string(), z.unknown()).optional(),
  })
  .transform((request) => ({
    ...request,
    model:
      request.model ??
      (request.provider === CoachProvider.Codex ? "" : "sonnet"),
  }));

export type LlmRequest = Omit<z.infer<typeof llmRequestSchema>, "provider"> & {
  provider?: CoachProvider;
};

export type LlmEvent =
  | { type: LlmEventType.Text; delta: string }
  | {
      type: LlmEventType.Done;
      model?: string;
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      cacheCreationTokens: number;
      cacheWrite5mTokens: number;
    }
  | { type: LlmEventType.Error; message: string };

type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: z.infer<typeof imagePart>["mediaType"];
        data: string;
      };
    };

export function toPromptContent(
  messages: LlmRequest["messages"],
): ContentBlock[] {
  const last = messages.at(-1);
  const history = messages.slice(0, -1);
  const blocks: ContentBlock[] = [];

  if (history.length > 0) {
    const transcript = history
      .map((message) => {
        const text = message.content
          .flatMap((part) => (part.type === "text" ? [part.text] : []))
          .join("\n");
        return `<${message.role}>\n${text}\n</${message.role}>`;
      })
      .join("\n");
    blocks.push({
      type: "text",
      text: `Conversation so far:\n${transcript}\n\nReply to the latest message.`,
    });
  }

  for (const part of last?.content ?? []) {
    blocks.push(
      part.type === "text"
        ? { type: "text", text: part.text }
        : {
            type: "image",
            source: {
              type: "base64",
              media_type: part.mediaType,
              data: part.data,
            },
          },
    );
  }
  return blocks;
}

export function jsonOf(
  reply: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const json = reply
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return { ok: true, value: JSON.parse(json) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type LlmTuning = Pick<Options, "thinking" | "effort"> & {
  shortCache?: boolean;
  provider?: CoachProvider;
  codexHome?: string;
};

export function llmQueryOptions(
  request: LlmRequest,
  abortController: AbortController,
  claudePath: string,
  tuning: LlmTuning = {},
): Options {
  const {
    shortCache = false,
    provider: _provider,
    codexHome: _codexHome,
    ...model
  } = tuning;
  return {
    ...model,
    pathToClaudeCodeExecutable: claudePath,
    cwd: os.tmpdir(),
    model: request.model,
    systemPrompt: request.system ?? "",
    settingSources: [],
    skills: [],
    tools: [],
    strictMcpConfig: true,
    mcpServers: {},
    persistSession: false,
    maxTurns: request.schema ? 3 : 1,
    includePartialMessages: true,
    env: shortCache
      ? { ...sessionEnv(process.env), FORCE_PROMPT_CACHING_5M: "1" }
      : sessionEnv(process.env),
    abortController,
    ...(request.schema
      ? { outputFormat: { type: "json_schema", schema: request.schema } }
      : {}),
  };
}

async function* singleMessage(
  content: ContentBlock[],
): AsyncIterable<SDKUserMessage> {
  yield {
    type: "user",
    message: { role: "user", content },
    parent_tool_use_id: null,
  };
}

export function eventsFromMessage(
  message: SDKMessage,
  structured: boolean,
): LlmEvent[] {
  if (
    !structured &&
    message.type === "stream_event" &&
    message.parent_tool_use_id === null &&
    message.event.type === "content_block_delta" &&
    message.event.delta.type === "text_delta"
  ) {
    return [{ type: LlmEventType.Text, delta: message.event.delta.text }];
  }
  if (message.type !== "result") return [];
  if (message.subtype !== "success") {
    return [
      {
        type: LlmEventType.Error,
        message: `the model run ended with ${message.subtype}`,
      },
    ];
  }
  const usage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cachedInputTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: message.usage.cache_creation_input_tokens ?? 0,
    cacheWrite5mTokens: cacheWrite5m(message.usage),
  };
  if (!structured) return [{ type: LlmEventType.Done, ...usage }];
  if (message.structured_output === undefined) {
    return [
      {
        type: LlmEventType.Error,
        message: "the model returned no structured output",
      },
    ];
  }
  return [
    {
      type: LlmEventType.Text,
      delta: JSON.stringify(message.structured_output),
    },
    { type: LlmEventType.Done, ...usage },
  ];
}

export async function* runLlm(
  request: LlmRequest,
  signal: AbortSignal,
  claudePath: string,
  tuning?: LlmTuning,
): AsyncIterable<LlmEvent> {
  if ((tuning?.provider ?? request.provider) === CoachProvider.Codex) {
    yield* runCodexLlm(request, signal, claudePath, tuning?.codexHome);
    return;
  }
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const run = query({
    prompt: singleMessage(toPromptContent(request.messages)),
    options: llmQueryOptions(request, abortController, claudePath, tuning),
  });
  try {
    for await (const message of run) {
      for (const event of eventsFromMessage(
        message,
        request.schema !== undefined,
      )) {
        yield event;
        if (event.type !== LlmEventType.Text) return;
      }
    }
    yield {
      type: LlmEventType.Error,
      message: "the model run ended without a result",
    };
  } finally {
    signal.removeEventListener("abort", abort);
    run.close();
  }
}

export function llmResponse(
  request: Request,
  executable: (provider: CoachProvider) => Promise<string>,
  tuning: Pick<LlmTuning, "codexHome"> = {},
): Response {
  return new Response(
    new ReadableStream<string>({
      async start(controller) {
        try {
          const body = llmRequestSchema.safeParse(await request.json());
          if (!body.success) {
            controller.enqueue(
              `${JSON.stringify({ type: LlmEventType.Error, message: body.error.message })}\n`,
            );
            return;
          }
          for await (const event of runLlm(
            body.data,
            request.signal,
            await executable(body.data.provider),
            { ...tuning, provider: body.data.provider },
          )) {
            controller.enqueue(`${JSON.stringify(event)}\n`);
          }
        } catch (error) {
          console.error("[llm] request failed", { _e: String(error) });
          controller.enqueue(
            `${JSON.stringify({ type: LlmEventType.Error, message: String(error) })}\n`,
          );
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "no-cache",
      },
    },
  );
}

async function* runCodexLlm(
  request: LlmRequest,
  signal: AbortSignal,
  executable: string,
  home?: string,
): AsyncIterable<LlmEvent> {
  const session = startCodexSession({
    executable,
    home,
    model: request.model,
    prompt: request.system ?? "",
    schema: request.schema,
    ephemeral: true,
    signal,
  });
  let answer = "";
  try {
    if (signal.aborted) return;
    session.ask(toPromptContent(request.messages));
    for await (const message of session.messages) {
      if (message.type === RuntimeMessageType.Text) {
        answer += message.delta;
        if (!request.schema)
          yield { type: LlmEventType.Text, delta: message.delta };
      }
      if (message.type !== RuntimeMessageType.Result) continue;
      if (message.is_error) {
        yield {
          type: LlmEventType.Error,
          message: message.result || "Codex could not finish the request.",
        };
        return;
      }
      if (request.schema) {
        const parsed = jsonOf(answer);
        if (!parsed.ok) {
          yield {
            type: LlmEventType.Error,
            message: "Codex returned invalid structured output.",
          };
          return;
        }
        yield { type: LlmEventType.Text, delta: JSON.stringify(parsed.value) };
      }
      const usage =
        message.usage && typeof message.usage === "object"
          ? Object.fromEntries(Object.entries(message.usage))
          : {};
      const model = Object.keys(message.modelUsage ?? {})[0];
      yield {
        type: LlmEventType.Done,
        ...(model ? { model } : {}),
        inputTokens: Number(usage.input_tokens) || 0,
        outputTokens: Number(usage.output_tokens) || 0,
        cachedInputTokens: Number(usage.cache_read_input_tokens) || 0,
        cacheCreationTokens: 0,
        cacheWrite5mTokens: 0,
      };
      return;
    }
    if (!signal.aborted)
      yield {
        type: LlmEventType.Error,
        message: "Codex ended without a result.",
      };
  } finally {
    session.close();
  }
}
