import {
  APICallError,
  UnsupportedFunctionalityError,
  type wrapLanguageModel,
} from "ai";
import { z } from "zod";

import {
  type ClaudeModel,
  commands as coachCommands,
} from "@anlg/plugin-coach";

import { providerFetch } from "./provider-fetch";

type LanguageModelV3 = Parameters<typeof wrapLanguageModel>[0]["model"];
type CallOptions = Parameters<LanguageModelV3["doGenerate"]>[0];
type GenerateResult = Awaited<ReturnType<LanguageModelV3["doGenerate"]>>;
type StreamResult = Awaited<ReturnType<LanguageModelV3["doStream"]>>;
type StreamPart =
  StreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;

const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: ImageType; data: string };

export type ClaudeRequest = {
  model: ClaudeModel;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: ContentPart[] }>;
  schema?: NonNullable<
    Extract<CallOptions["responseFormat"], { type: "json" }>["schema"]
  >;
};

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), delta: z.string() }),
  z.object({
    type: z.literal("done"),
    inputTokens: z.number(),
    outputTokens: z.number(),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

type ClaudeEvent = z.infer<typeof eventSchema>;

export type ClaudeCodeDeps = {
  endpoint: () => Promise<string>;
  fetch: typeof fetch;
};

const defaultDeps: ClaudeCodeDeps = {
  endpoint: async () => {
    const result = await coachCommands.llmEndpoint();
    if (result.status === "error") {
      throw new Error(result.error);
    }
    return result.data;
  },
  fetch: providerFetch,
};

function isImageType(mediaType: string): mediaType is ImageType {
  return IMAGE_TYPES.some((type) => type === mediaType);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function unsupported(functionality: string): never {
  throw new UnsupportedFunctionalityError({
    functionality,
    message: `Claude in Cue does not support ${functionality}.`,
  });
}

export function buildClaudeRequest(
  model: ClaudeModel,
  options: CallOptions,
): ClaudeRequest {
  if (options.tools?.length) {
    unsupported("tool calling");
  }

  const system: string[] = [];
  const messages: ClaudeRequest["messages"] = [];

  for (const message of options.prompt) {
    if (message.role === "system") {
      system.push(message.content);
      continue;
    }
    if (message.role === "tool") {
      unsupported("tool results");
    }

    const content: ContentPart[] = [];
    for (const part of message.content) {
      if (part.type === "text") {
        content.push({ type: "text", text: part.text });
      } else if (part.type === "file") {
        if (!isImageType(part.mediaType)) {
          unsupported(`${part.mediaType} attachments`);
        }
        if (part.data instanceof URL) {
          unsupported("image URLs");
        }
        content.push({
          type: "image",
          mediaType: part.mediaType,
          data: typeof part.data === "string" ? part.data : toBase64(part.data),
        });
      } else if (part.type === "tool-call" || part.type === "tool-result") {
        unsupported("tool calling");
      }
    }
    if (content.length > 0) {
      messages.push({ role: message.role, content });
    }
  }

  if (messages.length === 0) {
    throw new Error("Claude needs at least one message.");
  }

  return {
    model,
    ...(system.length > 0 ? { system: system.join("\n\n") } : {}),
    messages,
    ...(options.responseFormat?.type === "json" && options.responseFormat.schema
      ? { schema: options.responseFormat.schema }
      : {}),
  };
}

async function* readEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ClaudeEvent> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += value;
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) yield eventSchema.parse(JSON.parse(line));
      }
    }
    if (buffered.trim()) yield eventSchema.parse(JSON.parse(buffered));
  } finally {
    reader.releaseLock();
  }
}

function usage(event?: {
  inputTokens: number;
  outputTokens: number;
}): GenerateResult["usage"] {
  return {
    inputTokens: {
      total: event?.inputTokens,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: event?.outputTokens,
      text: undefined,
      reasoning: undefined,
    },
  };
}

export function createClaudeCodeModel(
  modelId: ClaudeModel,
  deps: ClaudeCodeDeps = defaultDeps,
): LanguageModelV3 {
  const doStream = async (options: CallOptions): Promise<StreamResult> => {
    const request = buildClaudeRequest(modelId, options);
    const url = `${await deps.endpoint()}/llm`;
    const response = await deps.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: options.abortSignal,
    });
    if (!response.ok || !response.body) {
      throw new APICallError({
        message: `Claude request failed with status ${response.status}`,
        url,
        requestBodyValues: request,
        statusCode: response.status,
        responseBody: await response.text(),
        isRetryable: response.status >= 500,
      });
    }
    const body = response.body;
    const textId = crypto.randomUUID();

    return {
      request: { body: request },
      stream: new ReadableStream<StreamPart>({
        async start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({
            type: "response-metadata",
            id: crypto.randomUUID(),
            timestamp: new Date(),
            modelId,
          });
          controller.enqueue({ type: "text-start", id: textId });
          try {
            for await (const event of readEvents(body)) {
              if (event.type === "text") {
                controller.enqueue({
                  type: "text-delta",
                  id: textId,
                  delta: event.delta,
                });
                continue;
              }
              if (event.type === "error") {
                controller.enqueue({
                  type: "error",
                  error: new Error(event.message),
                });
                controller.close();
                return;
              }
              controller.enqueue({ type: "text-end", id: textId });
              controller.enqueue({
                type: "finish",
                usage: usage(event),
                finishReason: { unified: "stop", raw: "stop" },
              });
              controller.close();
              return;
            }
            controller.enqueue({
              type: "error",
              error: new Error("Claude stopped before finishing its answer."),
            });
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      }),
    };
  };

  return {
    specificationVersion: "v3",
    provider: "claude_code",
    modelId,
    supportedUrls: {},
    doStream,
    doGenerate: async (options) => {
      const { stream, request } = await doStream(options);
      const reader = stream.getReader();
      let text = "";
      let finish: Extract<StreamPart, { type: "finish" }> | undefined;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value.type === "text-delta") text += value.delta;
        if (value.type === "error") throw value.error;
        if (value.type === "finish") finish = value;
      }
      if (!finish) {
        throw new Error("Claude stopped before finishing its answer.");
      }
      return {
        content: [{ type: "text", text }],
        finishReason: finish.finishReason,
        usage: finish.usage,
        warnings: [],
        request,
        response: { timestamp: new Date(), modelId },
      };
    },
  };
}
