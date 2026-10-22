import path from "node:path";

import { type CoachError, coachError } from "./errors";
import type { CoachEvent } from "./protocol";
import type { RuntimeMessage } from "./runtime-message";
import {
  type FoundSource,
  pickSources,
  type Source,
  sourcesFromTool,
} from "./sources";
import { type TurnUsage, turnUsage, type UsageSource } from "./usage";

export const OUTPUT_MAX = 4_000;
const DETAIL_MAX = 400;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function humanize(name: string): string {
  return name.replaceAll("_", " ");
}

function isPlainTerm(pattern: string): boolean {
  return pattern.length > 0 && /^[\p{L}\p{N} _.\-/…]+$/u.test(pattern);
}

export type ToolLabels = { done: string; active: string };

const label = (done: string, active: string): ToolLabels => ({ done, active });

export function toolLabels(
  name: string,
  input: Record<string, unknown>,
): ToolLabels {
  const file = path.basename(str(input.file_path) || str(input.path));
  const pattern = clip(str(input.pattern), 40);
  switch (name) {
    case "mcp__meeting__live_transcript":
      return label("Read the transcript", "Reading the transcript");
    case "mcp__meeting__transcript_edit_context":
      return label(
        "Checked transcript edit context",
        "Checking transcript edit context",
      );
    case "mcp__meeting__assign_speaker":
      return label("Named a speaker", "Naming a speaker");
    case "mcp__meeting__correct_transcript":
      return label("Corrected the transcript", "Correcting the transcript");
    case "mcp__meeting__meeting_info":
      return label(
        "Checked who's in the meeting",
        "Checking who's in the meeting",
      );
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
    case "mcp__meeting__search_meetings":
      return label("Searched your notes", "Searching your notes");
    case "mcp__meeting__get_meeting":
      return label("Read a past note", "Reading a past note");
    case "mcp__meeting__list_folders":
      return label("Checked your folders", "Checking your folders");
    case "mcp__meeting__list_tags":
      return label("Checked your tags", "Checking your tags");
    case "mcp__meeting__search_people":
      return label("Looked up contacts", "Looking up contacts");
    case "mcp__meeting__list_templates":
      return label("Checked your templates", "Checking your templates");
    case "mcp__meeting__list_action_items":
      return label("Checked action items", "Checking action items");
    case "mcp__meeting__create_note":
      return label("Created a note", "Creating a note");
    case "mcp__meeting__update_note_details":
      return label("Updated a note", "Updating a note");
    case "mcp__meeting__create_folder":
      return label("Created a folder", "Creating a folder");
    case "mcp__meeting__upsert_person":
      return label("Saved a contact", "Saving a contact");
    case "mcp__meeting__upsert_organization":
      return label("Saved an organization", "Saving an organization");
    case "mcp__meeting__add_participant":
      return label("Added a participant", "Adding a participant");
    case "mcp__meeting__upsert_template":
      return label("Saved a template", "Saving a template");
    case "mcp__meeting__show":
      return asRecord(input.block).kind === "move"
        ? label("Suggested a move", "Suggesting a move")
        : label("Showed a list", "Preparing a list");
    case "WebSearch": {
      const query = clip(str(input.query), 40);
      return query
        ? label(
            `Searched the web for “${query}”`,
            `Searching the web for “${query}”`,
          )
        : label("Searched the web", "Searching the web");
    }
    case "WebFetch": {
      const host = hostOf(str(input.url));
      return host
        ? label(`Read ${host}`, `Reading ${host}`)
        : label("Read a web page", "Reading a web page");
    }
    case "Read":
      return file
        ? label(`Read ${file}`, `Reading ${file}`)
        : label("Read a file", "Reading a file");
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

export function toolDetail(
  name: string,
  input: Record<string, unknown>,
): string | null {
  if (name === "Bash") return str(input.command) || null;
  if (name === "Read") return str(input.file_path) || null;
  if (name === "Grep") {
    const where = str(input.path) || str(input.glob);
    return (
      [str(input.pattern), where && `in ${where}`].filter(Boolean).join(" ") ||
      null
    );
  }
  if (name === "Glob")
    return (
      [str(input.pattern), str(input.path) && `in ${str(input.path)}`]
        .filter(Boolean)
        .join(" ") || null
    );
  if (name === "AskUserQuestion" || name === "TodoWrite") return null;
  const lines = Object.entries(input)
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    )
    .map(
      ([key, value]) =>
        `${humanize(key)}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
    );
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
  return response === undefined || response === null
    ? null
    : clip(JSON.stringify(response), OUTPUT_MAX);
}

export type ResultLike = UsageSource & {
  subtype: string;
  is_error: boolean;
  result?: string;
  errors?: string[];
  session_id?: string;
};

export type TurnOutcome = {
  ok: boolean;
  usage: TurnUsage | null;
  error: CoachError | null;
  sources: Source[];
};

export class TurnTracker {
  resumable: string | null = null;
  private starts = new Map<string, number>();
  private hookResults = new Map<string, string | null>();
  private lastMainUsage: unknown = undefined;
  private sdkError: string | undefined;
  private found: FoundSource[] = [];
  private answer = "";

  constructor(private readonly now: () => number = Date.now) {}

  beginTurn() {
    this.lastMainUsage = undefined;
    this.sdkError = undefined;
    this.found = [];
    this.answer = "";
  }

  hookResult(toolUseId: string, response: unknown, toolName = "") {
    this.hookResults.set(toolUseId, responseText(response));
    const direct = toolName !== "WebSearch";
    for (const source of sourcesFromTool(toolName, response))
      this.found.push({ ...source, direct });
  }

  handle(message: RuntimeMessage): CoachEvent[] {
    switch (message.type) {
      case "text":
        this.answer += message.delta;
        return [{ type: "text", delta: message.delta }];
      case "assistant_usage":
        this.lastMainUsage = message.usage;
        if (message.error) this.sdkError = message.error;
        return [];
      case "tool_start": {
        this.starts.set(message.id, this.now());
        const labels = toolLabels(message.name, message.input);
        return [
          {
            type: "tool",
            id: message.id,
            name: message.name,
            label: labels.done,
            activeLabel: labels.active,
            detail: toolDetail(message.name, message.input),
          },
        ];
      }
      case "tool_result": {
        const started = this.starts.get(message.id);
        if (started === undefined) return [];
        this.starts.delete(message.id);
        const hook = this.hookResults.get(message.id);
        this.hookResults.delete(message.id);
        return [
          {
            type: "tool_result",
            id: message.id,
            ok: !message.isError,
            output: toolResultText(message.content) ?? hook ?? null,
            durationMs: this.now() - started,
          },
        ];
      }
      default:
        return [];
    }
  }

  finishTurn(
    result: ResultLike,
    input: { interrupted: boolean; stderr: string },
  ): TurnOutcome {
    const usage = turnUsage({ result, lastMainUsage: this.lastMainUsage });
    const ok = result.subtype === "success" && !result.is_error;
    if ((ok || input.interrupted) && result.session_id)
      this.resumable = result.session_id;
    const sources = pickSources(this.found, this.answer);
    this.starts.clear();
    this.hookResults.clear();
    this.found = [];
    this.answer = "";
    if (ok || input.interrupted) return { ok, usage, error: null, sources };
    const message =
      result.result ||
      (result.errors ?? []).filter(Boolean).join("\n") ||
      result.subtype;
    return {
      ok,
      usage,
      error: coachError({
        message,
        stderr: input.stderr,
        ...(this.sdkError ? { sdkError: this.sdkError } : {}),
      }),
      sources,
    };
  }
}
