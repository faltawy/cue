import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import type { ResultLike } from "./turn-events";

export type RuntimeMessage =
  | { type: "text"; delta: string }
  | {
      type: "tool_start";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | { type: "tool_result"; id: string; content: unknown; isError: boolean }
  | { type: "assistant_usage"; usage: unknown; error?: string }
  | ({ type: "result" } & ResultLike);

export function claudeMessages(message: SDKMessage): RuntimeMessage[] {
  if (message.type === "result") return [{ ...message, type: "result" }];
  if (!("parent_tool_use_id" in message) || message.parent_tool_use_id !== null)
    return [];
  if (
    message.type === "stream_event" &&
    message.event.type === "content_block_delta" &&
    message.event.delta.type === "text_delta"
  ) {
    return [{ type: "text", delta: message.event.delta.text }];
  }
  if (message.type === "assistant") {
    return [
      {
        type: "assistant_usage",
        usage: message.message.usage,
        ...(message.error ? { error: message.error } : {}),
      },
      ...message.message.content.flatMap((block): RuntimeMessage[] =>
        block.type === "tool_use"
          ? [
              {
                type: "tool_start",
                id: block.id,
                name: block.name,
                input:
                  block.input && typeof block.input === "object"
                    ? Object.fromEntries(Object.entries(block.input))
                    : {},
              },
            ]
          : [],
      ),
    ];
  }
  if (message.type === "user" && Array.isArray(message.message.content)) {
    return message.message.content.flatMap((block): RuntimeMessage[] =>
      block.type === "tool_result"
        ? [
            {
              type: "tool_result",
              id: block.tool_use_id,
              content: block.content,
              isError: block.is_error === true,
            },
          ]
        : [],
    );
  }
  return [];
}

export async function* normalizeClaude(
  messages: AsyncIterable<SDKMessage>,
): AsyncIterable<RuntimeMessage> {
  for await (const message of messages) yield* claudeMessages(message);
}
