import { type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import { type ResultLike } from "./turn-events";

export enum RuntimeMessageType {
  Text = "text",
  ToolStart = "tool_start",
  ToolResult = "tool_result",
  AssistantUsage = "assistant_usage",
  Result = "result",
}

export type RuntimeMessage =
  | { type: RuntimeMessageType.Text; delta: string }
  | {
      type: RuntimeMessageType.ToolStart;
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: RuntimeMessageType.ToolResult;
      id: string;
      content: unknown;
      isError: boolean;
    }
  | { type: RuntimeMessageType.AssistantUsage; usage: unknown; error?: string }
  | ({ type: RuntimeMessageType.Result } & ResultLike);

export function claudeMessages(message: SDKMessage): RuntimeMessage[] {
  if (message.type === "result")
    return [{ ...message, type: RuntimeMessageType.Result }];
  if (!("parent_tool_use_id" in message) || message.parent_tool_use_id !== null)
    return [];
  if (
    message.type === "stream_event" &&
    message.event.type === "content_block_delta" &&
    message.event.delta.type === "text_delta"
  ) {
    return [{ type: RuntimeMessageType.Text, delta: message.event.delta.text }];
  }
  if (message.type === "assistant") {
    return [
      {
        type: RuntimeMessageType.AssistantUsage,
        usage: message.message.usage,
        ...(message.error ? { error: message.error } : {}),
      },
      ...message.message.content.flatMap((block): RuntimeMessage[] =>
        block.type === "tool_use"
          ? [
              {
                type: RuntimeMessageType.ToolStart,
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
              type: RuntimeMessageType.ToolResult,
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
