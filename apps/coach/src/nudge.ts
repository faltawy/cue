import { z } from "zod";

import { isNothing, NOTHING } from "./checkin";
import type { Hit, HitKind } from "./detect";
import { jsonOf, runLlm } from "./llm";
import { type Moment, type Move, MOVE_TAGS, type MoveTag, moveFields, QUOTE_MAX } from "./move";
import { charTokens, estimateTokens, NO_SPEND, type Spend, spendOf } from "./pricing";
import { INSTRUCTIONS_HEADING } from "./session";
import { type TalkStats, talkStats, talkSummary } from "./talk-time";
import { formatTimestamp } from "./timestamp";
import { renderLines, type TranscriptLine } from "./transcript";

export const NUDGE_MODEL = "sonnet";
export const NUDGE_WINDOW_MS = 3 * 60_000;

export const NUDGE_SYSTEM = `You are the user's live meeting coach: you make them better in this meeting, not just better informed. They are mid-conversation and glance at your note between sentences. "You" in the transcript is the user; other speakers appear by name, as "Speaker N", or as "Them".
A moment was just flagged. Find the single most useful move for the next 30 seconds, and its tag:
- open_question, a question or request aimed at the user: the answer or point to make, as a line they can say
- pushback (price, a competitor, "we tried this before"): acknowledge it and ask what is behind it before defending or discounting
- buying_signal: answer briefly, then move to a concrete next step (who decides, by when); risk (a new decision maker, a budget review, stalling): get ahead of it
- vague_promise, theirs or the user's: pin who, what and by when, or get the next meeting on the calendar
- over_promise, the user promising a date, feature or discount they can't confirm, or giving_ground, giving something without getting something back: correct it now, gracefully, or trade instead
- talk_time, the user doing most of the talking (see the talk time), rambling or hedging: answer in one sentence, then hand the floor back with a question
- decision_owner, a decision without an owner, or agenda, the agenda drifting: name the owner and the date, or park it
- escalations (risk): acknowledge the impact before any explanation, then give the next update time; feedback (open_question): the specific behaviour and its impact, then ask; interviews (open_question): probe "we" and vague claims for what the person did and how it was measured; executives (open_question): answer first, then one reason
Reply with only one JSON object, under 45 words of text in all:
{"tag": exactly one of ${MOVE_TAGS.map((tag) => `"${tag}"`).join(", ")}, "headline": "the move, in under 10 words, in English", "verb": "Say" or "Ask", "line": "one or two sentences the user can say word for word, in the meeting's main language, tied to what was just said", "watch_out": "under 12 words, in the meeting's main language, only when essential (what to avoid, or one fact they need); otherwise leave this key out"}
One move only: no alternatives, no "if you know…" branches, no second question, no Why: label, no markdown, no preamble, no recap of the transcript.
Never invent facts, prices, dates or causes, and never leave blanks like [date]: say only what the transcript or the user's instructions support. You may propose when the user will follow up ("by Friday"). When the answer is unknown, coach how to handle not knowing; if it needs the user's files, email or the web, watch_out says what to ask the coach.
The user's own instructions below, if any, override this.
If the user just answered or confirmed it well, someone else already gave a clear owner and date, or you have nothing better than what the user would do anyway, reply with exactly ${NOTHING} and nothing else.`;

const MOMENT_MAX_CHARS = 300;
const MOMENTS_MAX = 3;

const MOMENT: Record<HitKind, string> = {
  question: "a question aimed at the user",
  name: "someone said the user's name",
  objection: "pushback (price, timing, a competitor, a decision maker or doubt)",
  commitment: "a commitment",
  number: "a number, date or price",
  monologue: "the user has held the floor too long; hand it back with one concrete question about what they were just saying",
};

const TAG_HINT: Partial<Record<HitKind, MoveTag>> = { monologue: "talk_time", objection: "pushback" };

const LABEL_ORDER: readonly HitKind[] = ["monologue", "objection", "question", "name", "commitment", "number"];

const LABEL: Record<HitKind, string> = {
  question: "Question for you",
  name: "You were mentioned",
  objection: "Pushback",
  commitment: "Commitment",
  number: "Number mentioned",
  monologue: "Long monologue",
};

function tagHint(hits: readonly Hit[]): MoveTag | undefined {
  const kind = LABEL_ORDER.find((candidate) => TAG_HINT[candidate] && hits.some((hit) => hit.kind === candidate));
  return kind && TAG_HINT[kind];
}

export function nudgeLabel(hits: readonly Hit[]): string {
  const kind = LABEL_ORDER.find((candidate) => hits.some((hit) => hit.kind === candidate)) ?? "question";
  return LABEL[kind];
}

function moments(hits: readonly Hit[]): string {
  const byLine = new Map<number, Hit[]>();
  for (const hit of hits) byLine.set(hit.lineIndex, [...(byLine.get(hit.lineIndex) ?? []), hit]);
  return [...byLine.values()]
    .slice(-MOMENTS_MAX)
    .map((group) => {
      const text = group[0]?.text.trim() ?? "";
      const quote = text.length > MOMENT_MAX_CHARS ? `${text.slice(0, MOMENT_MAX_CHARS)}…` : text;
      return `- ${group.map((hit) => MOMENT[hit.kind]).join(", ")}: "${quote}"`;
    })
    .join("\n");
}

const TOKENS = { instructions: 1_000, context: 100, why: 40, lines: 1_150 };

function headWithin(text: string, maxTokens: number): string {
  let used = 0;
  let end = 0;
  for (const char of text) {
    used += charTokens(char);
    if (used > maxTokens) return `${text.slice(0, end).trimEnd()}…`;
    end += char.length;
  }
  return text;
}

function tailWithin(text: string, maxTokens: number): string {
  const chars = [...text];
  let used = 0;
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    used += charTokens(chars[index] ?? "");
    if (used > maxTokens) return `…${chars.slice(index + 1).join("").trimStart()}`;
  }
  return text;
}

function recentLines(lines: readonly TranscriptLine[], maxTokens: number): string {
  const kept: string[] = [];
  let used = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const current = lines[index];
    if (!current) continue;
    const rendered = renderLines([current]);
    const cost = estimateTokens(rendered) + 1;
    if (used + cost > maxTokens) {
      if (kept.length === 0) kept.push(renderLines([{ ...current, text: tailWithin(current.text.trim(), maxTokens - 20) }]));
      break;
    }
    kept.unshift(rendered);
    used += cost;
  }
  return kept.join("\n");
}

export function nudgeSystem(instructions: string): string {
  const own = instructions.trim();
  return own ? `${NUDGE_SYSTEM}\n\n${INSTRUCTIONS_HEADING}\n${headWithin(own, TOKENS.instructions)}` : NUDGE_SYSTEM;
}

export type NudgeInput = { context: string; hits: readonly Hit[]; why: string; lines: readonly TranscriptLine[] };

export function nudgeMessage(input: NudgeInput): string {
  const latestEnd = input.lines.at(-1)?.end_ms ?? 0;
  const recent = input.lines.filter((line) => line.end_ms >= latestEnd - NUDGE_WINDOW_MS);
  const stats = talkStats(input.lines);
  const tag = tagHint(input.hits);
  return `Meeting: ${headWithin(input.context, TOKENS.context)}
Flagged moment:
${moments(input.hits)}
Flagged because: ${headWithin(input.why, TOKENS.why)}
${tag ? `Suggested tag: ${tag}\n` : ""}${stats ? `${talkSummary(stats)}\n` : ""}The last 3 minutes:
${recentLines(recent, TOKENS.lines) || "(nothing yet)"}`;
}

const NOTES_MAX = 3;
const NOTE_TOKENS = 150;

export function nudgeNote(label: string, text: string): string {
  return `${label}: ${headWithin(text.replace(/\s+/g, " ").trim(), NOTE_TOKENS)}`;
}

export function rememberNote(notes: readonly string[], note: string): string[] {
  return [...notes, note].slice(-NOTES_MAX);
}

export function withNudgeNotes(notes: readonly string[], prompt: string): string {
  if (notes.length === 0) return prompt;
  return `(Since your last answer, the user also saw these automatic nudges, written outside this chat from the live transcript:
${notes.map((note) => `- ${note}`).join("\n")})

${prompt}`;
}

export const nudgeReplySchema = z.strictObject(moveFields);

export type NudgeReply = z.infer<typeof nudgeReplySchema>;

export type ParsedNudge = { kind: "nothing" } | { kind: "move"; reply: NudgeReply } | { kind: "malformed"; error: string };

export function parseNudge(reply: string): ParsedNudge {
  if (isNothing(reply) || reply.trim() === "") return { kind: "nothing" };
  const json = jsonOf(reply);
  const parsed = json.ok ? nudgeReplySchema.safeParse(json.value) : null;
  if (parsed?.success) return { kind: "move", reply: parsed.data };
  const error = parsed ? z.prettifyError(parsed.error) : json.ok ? "" : json.error;
  console.error("[coach] nudge reply was not the expected JSON; dropping it", { _e: error, reply: reply.slice(0, 300) });
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
    quote: quote.length > QUOTE_MAX ? `${quote.slice(0, QUOTE_MAX - 1)}…` : quote,
    at: formatTimestamp(line.start_ms),
  };
}

export function nudgeMove(input: NudgeInput, reply: NudgeReply): { move: Move; talk: TalkStats | null } {
  const moment = triggerMoment(input);
  return {
    move: { ...reply, ...(moment ? { moment } : {}) },
    talk: reply.tag === "talk_time" ? talkStats(input.lines) : null,
  };
}

export type NudgeResult =
  | { ok: true; move: Move | null; talk: TalkStats | null; spend: Spend }
  | { ok: false; error: string; spend: Spend };

export async function runNudge(
  input: NudgeInput,
  options: { instructions: string; signal: AbortSignal; claudePath: string },
): Promise<NudgeResult> {
  let text = "";
  let spend = NO_SPEND;
  for await (const event of runLlm(
    {
      model: NUDGE_MODEL,
      system: nudgeSystem(options.instructions),
      messages: [{ role: "user", content: [{ type: "text", text: nudgeMessage(input) }] }],
    },
    options.signal,
    options.claudePath,
    { effort: "low", shortCache: true },
  )) {
    if (event.type === "text") text += event.delta;
    else if (event.type === "done") spend = spendOf(NUDGE_MODEL, event);
    else return { ok: false, error: event.message, spend };
  }
  const parsed = parseNudge(text);
  if (parsed.kind !== "move") return { ok: true, move: null, talk: null, spend };
  return { ok: true, ...nudgeMove(input, parsed.reply), spend };
}
