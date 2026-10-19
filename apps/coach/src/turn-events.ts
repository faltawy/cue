// Tool lifecycle mapping adapted from Catamorphic's packages/claude-code/src/transcript.ts (Apache-2.0, see NOTICE).
import path from "node:path";

import { type CoachError, coachError } from "./errors";
import type { CoachEvent } from "./protocol";
import { type TurnUsage, turnUsage, type UsageSource } from "./usage";

export const OUTPUT_MAX = 4_000;
const DETAIL_MAX = 400;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function humanize(name: string): string {
  return name.replaceAll("_", " ");
}

function isPlainTerm(pattern: string): boolean {
  return pattern.length > 0 && /^[\p{L}\p{N} _.\-/…]+$/u.test(pattern);
}

export type ToolLabels = { done: string; active: string };

const label = (done: string, active: string): ToolLabels => ({ done, active });

export function toolLabels(name: string, input: Record<string, unknown>): ToolLabels {
  const file = path.basename(str(input.file_path) || str(input.path));
  const pattern = clip(str(input.pattern), 40);
  switch (name) {
    case "mcp__meeting__live_transcript":
      return label("Read the transcript", "Reading the transcript");
    case "mcp__meeting__meeting_info":
      return label("Checked who's in the meeting", "Checking who's in the meeting");
    case "mcp__meeting__meeting_notes":
      return label("Read the notes", "Reading the notes");
    case "mcp__meeting__update_note":
      return label("Wrote to the notes", "Writing to the notes");
    case "mcp__meeting__add_action_item":
      return label("Added an action item", "Adding an action item");
    case "mcp__meeting__complete_action_item":
      return label("Checked off an action item", "Checking off an action item");
    case "mcp__meeting__undo_last_coach_edit":
      return label("Undid its last edit", "Undoing its last edit");
    case "Read":
      return file ? label(`Read ${file}`, `Reading ${file}`) : label("Read a file", "Reading a file");
    case "Grep":
      return isPlainTerm(pattern)
        ? label(`Searched for “${pattern}”`, `Searching for “${pattern}”`)
        : label("Searched the project", "Searching the project");
    case "Glob":
      return label("Searched files", "Searching files");
    case "Bash": {
      const command = clip(str(input.command).split("\n")[0] ?? "", 48);
      return label(`Ran ${command}`, `Running ${command}`);
    }
    case "Task":
    case "Agent":
      return label("Looked something up", "Looking something up");
    case "AskUserQuestion":
      return label("Asked you a question", "Waiting for your answer");
    case "TodoWrite":
      return label("Updated its plan", "Planning");
  }
  if (name.startsWith("mcp__")) {
    const [, server = "", tool = ""] = name.split("__");
    const text = `${humanize(server)} · ${humanize(tool)}`;
    return label(text, text);
  }
  return label(humanize(name), humanize(name));
}

export function toolDetail(name: string, input: Record<string, unknown>): string | null {
  if (name === "Bash") return str(input.command) || null;
  if (name === "Read") return str(input.file_path) || null;
  if (name === "Grep") {
    const where = str(input.path) || str(input.glob);
    return [str(input.pattern), where && `in ${where}`].filter(Boolean).join(" ") || null;
  }
  if (name === "Glob") return [str(input.pattern), str(input.path) && `in ${str(input.path)}`].filter(Boolean).join(" ") || null;
  if (name === "AskUserQuestion" || name === "TodoWrite") return null;
  const lines = Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${humanize(key)}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  return lines.length > 0 ? clip(lines.join("\n"), DETAIL_MAX) : null;
}

export function toolResultText(content: unknown): string | null {
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part: unknown) => str(asRecord(part).text)).join("")
        : "";
  const trimmed = text.trim();
  return trimmed ? clip(trimmed, OUTPUT_MAX) : null;
}

function responseText(response: unknown): string | null {
  if (typeof response === "string") return toolResultText(response);
  const record = asRecord(response);
  if (Array.isArray(record.content)) return toolResultText(record.content);
  return response === undefined || response === null ? null : clip(JSON.stringify(response), OUTPUT_MAX);
}

export type ResultLike = UsageSource & {
  subtype: string;
  is_error: boolean;
  result?: string;
  errors?: string[];
};

export type TurnOutcome = {
  ok: boolean;
  usage: TurnUsage | null;
  error: CoachError | null;
};

function blocks(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export class TurnTracker {
  sessionId: string | null = null;
  private starts = new Map<string, number>();
  private hookResults = new Map<string, string | null>();
  private lastMainUsage: unknown = undefined;
  private sdkError: string | undefined;

  constructor(private readonly now: () => number = Date.now) {}

  beginTurn() {
    this.lastMainUsage = undefined;
    this.sdkError = undefined;
  }

  hookResult(toolUseId: string, response: unknown) {
    this.hookResults.set(toolUseId, responseText(response));
  }

  handle(raw: unknown): CoachEvent[] {
    const message = asRecord(raw);
    if (str(message.session_id)) this.sessionId = str(message.session_id);
    if (message.parent_tool_use_id !== null) return [];
    switch (message.type) {
      case "stream_event": {
        const event = asRecord(message.event);
        const delta = asRecord(event.delta);
        return event.type === "content_block_delta" && delta.type === "text_delta" && str(delta.text)
          ? [{ type: "text", delta: str(delta.text) }]
          : [];
      }
      case "assistant": {
        const body = asRecord(message.message);
        if (str(message.error)) this.sdkError = str(message.error);
        if (body.usage) this.lastMainUsage = body.usage;
        return blocks(body.content).flatMap((block): CoachEvent[] => {
          const id = str(block.id);
          const name = str(block.name);
          if (block.type !== "tool_use" || !id || !name) return [];
          const input = asRecord(block.input);
          this.starts.set(id, this.now());
          const labels = toolLabels(name, input);
          return [
            { type: "tool", id, name, label: labels.done, activeLabel: labels.active, detail: toolDetail(name, input) },
          ];
        });
      }
      case "user":
        return blocks(asRecord(message.message).content).flatMap((block): CoachEvent[] => {
          const id = str(block.tool_use_id);
          const started = this.starts.get(id);
          if (block.type !== "tool_result" || started === undefined) return [];
          this.starts.delete(id);
          const hook = this.hookResults.get(id);
          this.hookResults.delete(id);
          return [
            {
              type: "tool_result",
              id,
              ok: block.is_error !== true,
              output: toolResultText(block.content) ?? hook ?? null,
              durationMs: this.now() - started,
            },
          ];
        });
      default:
        return [];
    }
  }

  finishTurn(result: ResultLike, input: { interrupted: boolean; stderr: string }): TurnOutcome {
    const usage = turnUsage({ result, lastMainUsage: this.lastMainUsage });
    const ok = result.subtype === "success" && !result.is_error;
    this.starts.clear();
    this.hookResults.clear();
    if (ok || input.interrupted) return { ok, usage, error: null };
    const message = (result.result || (result.errors ?? []).filter(Boolean).join("\n")) || result.subtype;
    return {
      ok,
      usage,
      error: coachError({ message, stderr: input.stderr, ...(this.sdkError ? { sdkError: this.sdkError } : {}) }),
    };
  }
}
