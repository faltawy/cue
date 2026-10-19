import { NOTHING } from "./checkin";
import type { Hit, HitKind } from "./detect";
import { runLlm } from "./llm";
import { charTokens, estimateTokens, NO_SPEND, type Spend, spendOf } from "./pricing";
import { INSTRUCTIONS_HEADING } from "./session";
import { renderLines, type TranscriptLine } from "./transcript";

export const NUDGE_MODEL = "sonnet";
export const NUDGE_WINDOW_MS = 3 * 60_000;

export const NUDGE_SYSTEM = `You are a live meeting coach. The user is in a meeting right now and glances at your note between sentences. "You" in the transcript is the user; other speakers appear by name, as "Speaker N", or as "Them".
A moment was flagged as one the user may need help with. From the meeting details, the transcript excerpt and what you know, help with that moment in at most 3 short lines:
- a question or request aimed at the user: the answer, or the point to make
- a fact or number that sounds wrong: the correction
- a promise someone made: who, what, when, to note down
- a number, date or price: what to check or write down
Lead with the useful part. No preamble, and don't repeat the transcript back.
You cannot look anything up here. If a good answer needs the user's files, email or the web, say in one line what to ask the coach.
If you have nothing the user doesn't already know, reply with exactly ${NOTHING} and nothing else.
Reply in English even when the meeting is in another language.`;

const MOMENT_MAX_CHARS = 300;
const MOMENTS_MAX = 3;

const MOMENT: Record<HitKind, string> = {
  question: "a question aimed at the user",
  name: "someone said the user's name",
  commitment: "a commitment",
  number: "a number, date or price",
};

const LABEL_ORDER: readonly HitKind[] = ["question", "name", "commitment", "number"];

const LABEL: Record<HitKind, string> = {
  question: "Question for you",
  name: "You were mentioned",
  commitment: "Commitment",
  number: "Number mentioned",
};

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

const TOKENS = { instructions: 1_000, context: 100, why: 40, lines: 1_400 };

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
  return `Meeting: ${headWithin(input.context, TOKENS.context)}
Flagged moment:
${moments(input.hits)}
Flagged because: ${headWithin(input.why, TOKENS.why)}
The last 3 minutes:
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

export type NudgeResult = { ok: true; text: string; spend: Spend } | { ok: false; error: string; spend: Spend };

export async function runNudge(
  input: NudgeInput,
  options: { instructions: string; signal: AbortSignal; claudePath?: string },
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
  return { ok: true, text: text.trim(), spend };
}
