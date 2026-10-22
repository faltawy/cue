import { z } from "zod";

import { isNothing, NOTHING } from "./checkin";
import type { Hit, HitKind } from "./detect";
import { jsonOf, runLlm } from "./llm";
import {
  type Moment,
  type Move,
  type EvidenceTarget,
  MOVE_TAGS,
  type MoveTag,
  moveFields,
  QUOTE_MAX,
} from "./move";
import {
  NO_SPEND,
  type Spend,
  spendOf,
} from "./pricing";
import type { CoachProvider } from "./provider";
import { INSTRUCTIONS_HEADING } from "./session";
import { type TalkStats, talkStats, talkSummary } from "./talk-time";
import { formatTimestamp } from "./timestamp";
import { headWithin, renderRecentLines } from "./transcript-window";
import type { TranscriptLine } from "./transcript";
import { TRIAGE_MODEL } from "./triage";

export const NUDGE_MODEL = "sonnet";
export const NUDGE_WINDOW_MS = 3 * 60_000;

export const NUDGE_SYSTEM = `You are the user's live meeting coach, a sharp and calm colleague beside them. They glance at your note between sentences. "You" is the user; other speakers appear by name, as "Speaker N", or as "Them".
Read the latest exchange in context and follow the user's apparent goal. Give one timely move for the next turn: a direct answer to an open question; acknowledge pushback before exploring its cause; make a promise concrete (owner, action, time); or hand the floor back after a long monologue. For a buying signal, suggest one concrete next step. Keep it natural, specific to what was said, and in the meeting's language. Prefer one grounded open question or a short phrase the user can say. Avoid generic advice, recaps, invented details, and multiple options.
Stay quiet if the moment is stale, already answered or handled, the user just handled it well, or no useful move is clear. When unsure, reply with exactly ${NOTHING}.
Reply with only one JSON object, under 45 words of text in all:
{"tag": exactly one of ${MOVE_TAGS.map((tag) => `"${tag}"`).join(", ")}, "headline": "the move, in under 10 words, in English", "verb": "Say" or "Ask", "line": "one or two sentences the user can say word for word, in the meeting's main language, tied to what was just said", "watch_out": "under 12 words, in the meeting's main language, only when essential (what to avoid, or one fact they need); otherwise leave this key out"}
One move only: no branches, second question, markdown, preamble, transcript recap, or invented facts. If the user needs files, email, or web research, say what to check after the call. User instructions below override this.`;

const MOMENT_MAX_CHARS = 300;
const MOMENTS_MAX = 3;

const MOMENT: Record<HitKind, string> = {
  question: "a question aimed at the user",
  name: "someone said the user's name",
  objection:
    "pushback (price, timing, a competitor, a decision maker or doubt)",
  commitment: "a commitment",
  number: "a number, date or price",
  monologue:
    "the user has held the floor too long; hand it back with one concrete question about what they were just saying",
};

const TAG_HINT: Partial<Record<HitKind, MoveTag>> = {
  monologue: "talk_time",
  objection: "pushback",
};

const LABEL_ORDER: readonly HitKind[] = [
  "monologue",
  "objection",
  "question",
  "name",
  "commitment",
  "number",
];

const LABEL: Record<HitKind, string> = {
  question: "Question for you",
  name: "You were mentioned",
  objection: "Pushback",
  commitment: "Commitment",
  number: "Number mentioned",
  monologue: "Long monologue",
};

function tagHint(hits: readonly Hit[]): MoveTag | undefined {
  const kind = LABEL_ORDER.find(
    (candidate) =>
      TAG_HINT[candidate] && hits.some((hit) => hit.kind === candidate),
  );
  return kind && TAG_HINT[kind];
}

export function nudgeLabel(hits: readonly Hit[]): string {
  const kind =
    LABEL_ORDER.find((candidate) =>
      hits.some((hit) => hit.kind === candidate),
    ) ?? "question";
  return LABEL[kind];
}

function moments(hits: readonly Hit[]): string {
  const byLine = new Map<number, Hit[]>();
  for (const hit of hits)
    byLine.set(hit.lineIndex, [...(byLine.get(hit.lineIndex) ?? []), hit]);
  return [...byLine.values()]
    .slice(-MOMENTS_MAX)
    .map((group) => {
      const text = group[0]?.text.trim() ?? "";
      const quote =
        text.length > MOMENT_MAX_CHARS
          ? `${text.slice(0, MOMENT_MAX_CHARS)}…`
          : text;
      return `- ${group.map((hit) => MOMENT[hit.kind]).join(", ")}: "${quote}"`;
    })
    .join("\n");
}

const TOKENS = { instructions: 1_000, context: 100, why: 40, lines: 1_150 };

export function nudgeSystem(instructions: string): string {
  const own = instructions.trim();
  return own
    ? `${NUDGE_SYSTEM}\n\n${INSTRUCTIONS_HEADING}\n${headWithin(own, TOKENS.instructions)}`
    : NUDGE_SYSTEM;
}

export type NudgeInput = {
  context: string;
  hits: readonly Hit[];
  why: string;
  lines: readonly TranscriptLine[];
  sessionId?: string;
};

export function nudgeMessage(input: NudgeInput): string {
  const latestEnd = input.lines.at(-1)?.end_ms ?? 0;
  const recent = input.lines.filter(
    (line) => line.end_ms >= latestEnd - NUDGE_WINDOW_MS,
  );
  const stats = talkStats(input.lines);
  const tag = tagHint(input.hits);
  return `Meeting: ${headWithin(input.context, TOKENS.context)}
Flagged moment:
${moments(input.hits)}
Flagged because: ${headWithin(input.why, TOKENS.why)}
${tag ? `Suggested tag: ${tag}\n` : ""}${stats ? `${talkSummary(stats)}\n` : ""}The last 3 minutes:
${renderRecentLines(recent, TOKENS.lines) || "(nothing yet)"}`;
}

const NOTES_MAX = 3;
const NOTE_TOKENS = 150;

export function nudgeNote(label: string, text: string): string {
  return `${label}: ${headWithin(text.replace(/\s+/g, " ").trim(), NOTE_TOKENS)}`;
}

export function rememberNote(notes: readonly string[], note: string): string[] {
  return [...notes, note].slice(-NOTES_MAX);
}

export function withNudgeNotes(
  notes: readonly string[],
  prompt: string,
): string {
  if (notes.length === 0) return prompt;
  return `(Since your last answer, the user also saw these automatic nudges, written outside this chat from the live transcript:
${notes.map((note) => `- ${note}`).join("\n")})

${prompt}`;
}

export const nudgeReplySchema = z.strictObject(moveFields);

export type NudgeReply = z.infer<typeof nudgeReplySchema>;

export type ParsedNudge =
  | { kind: "nothing" }
  | { kind: "move"; reply: NudgeReply }
  | { kind: "malformed"; error: string };

export function parseNudge(reply: string): ParsedNudge {
  if (isNothing(reply) || reply.trim() === "") return { kind: "nothing" };
  const json = jsonOf(reply);
  const parsed = json.ok ? nudgeReplySchema.safeParse(json.value) : null;
  if (parsed?.success) return { kind: "move", reply: parsed.data };
  const error = parsed
    ? z.prettifyError(parsed.error)
    : json.ok
      ? ""
      : json.error;
  console.error("[coach] nudge reply was not the expected JSON; dropping it", {
    _e: error,
    reply: reply.slice(0, 300),
  });
  return { kind: "malformed", error };
}

function triggerMoment(input: NudgeInput): Moment | undefined {
  const latest = input.hits.reduce<Hit | undefined>(
    (found, hit) => (found && found.lineIndex >= hit.lineIndex ? found : hit),
    undefined,
  );
  const line = latest ? input.lines[latest.lineIndex] : undefined;
  const quote = latest?.text.trim() ?? "";
  if (!line || !quote) return undefined;
  return {
    speaker: line.speaker,
    quote:
      quote.length > QUOTE_MAX ? `${quote.slice(0, QUOTE_MAX - 1)}…` : quote,
    at: formatTimestamp(line.start_ms),
  };
}

export function nudgeMove(
  input: NudgeInput,
  reply: NudgeReply,
): { move: Move; talk: TalkStats | null } {
  const sourceHit = input.hits.reduce<Hit | undefined>(
    (found, hit) => (found && found.lineIndex >= hit.lineIndex ? found : hit),
    undefined,
  );
  const sourceLine = sourceHit
    ? input.lines[sourceHit.lineIndex]
    : input.lines.at(-1);
  const moment =
    triggerMoment(input) ??
    (sourceLine
      ? {
          speaker: sourceLine.speaker,
          quote: sourceLine.text.trim().slice(0, QUOTE_MAX),
          at: formatTimestamp(sourceLine.start_ms),
        }
      : undefined);
  const evidence: EvidenceTarget | undefined =
    input.sessionId && sourceLine
      ? { sessionId: input.sessionId, timestampMs: sourceLine.start_ms }
      : undefined;
  return {
    move: {
      ...reply,
      ...(moment ? { moment } : {}),
      ...(evidence ? { evidence } : {}),
    },
    talk: reply.tag === "talk_time" ? talkStats(input.lines) : null,
  };
}

export type NudgeResult =
  | { ok: true; move: Move | null; talk: TalkStats | null; spend: Spend }
  | { ok: false; error: string; spend: Spend };

export function nudgeModel(options: {
  provider?: CoachProvider;
  model?: string;
  fast?: boolean;
}): string {
  if (options.provider === "codex") return options.model ?? "";
  return options.fast ? TRIAGE_MODEL : NUDGE_MODEL;
}

export async function runNudge(
  input: NudgeInput,
  options: {
    instructions: string;
    signal: AbortSignal;
    claudePath: string;
    provider?: CoachProvider;
    model?: string;
    fast?: boolean;
    codexHome?: string;
  },
): Promise<NudgeResult> {
  let text = "";
  let spend = NO_SPEND;
  for await (const event of runLlm(
    {
      model: nudgeModel(options),
      system: nudgeSystem(options.instructions),
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: nudgeMessage(input) }],
        },
      ],
    },
    options.signal,
    options.claudePath,
    {
      effort: "low",
      shortCache: true,
      provider: options.provider,
      codexHome: options.codexHome,
    },
  )) {
    if (event.type === "text") text += event.delta;
    else if (event.type === "done")
      spend = spendOf(
        event.model ??
          nudgeModel(options),
        event,
      );
    else return { ok: false, error: event.message, spend };
  }
  const parsed = parseNudge(text);
  if (parsed.kind !== "move")
    return { ok: true, move: null, talk: null, spend };
  return { ok: true, ...nudgeMove(input, parsed.reply), spend };
}
