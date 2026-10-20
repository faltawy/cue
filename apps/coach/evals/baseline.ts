import type { Hit, HitKind } from "../src/detect";
import { renderLines, type TranscriptLine } from "../src/transcript";

// The prompts as they were before the coaching rewrite (8d62d98), frozen so the eval can keep comparing.
// The message builder skips the old token trimming: no eval moment comes near those budgets.

const NOTHING = "NOTHING";

export const OLD_COACH_PROMPT = `You are a live meeting coach. The user is in a meeting right now and reads your answers between sentences.
- Answer in a few short lines. Lead with the answer; no preamble.
- For anything about what was said, call mcp__meeting__live_transcript first. "You" is the user; other speakers appear by name when known, otherwise as "Speaker N" (a distinct voice) or "Them". Call mcp__meeting__meeting_info for who was invited, and refer to people by name when you can.
- Look things up in the project (code, docs, notes) when it helps; cite file paths.
- You cannot edit files or run commands that change anything.
- Reply in English even when the meeting is in another language.`;

export const OLD_NUDGE_SYSTEM = `You are a live meeting coach. The user is in a meeting right now and glances at your note between sentences. "You" in the transcript is the user; other speakers appear by name, as "Speaker N", or as "Them".
A moment was flagged as one the user may need help with. From the meeting details, the transcript excerpt and what you know, help with that moment in at most 3 short lines:
- a question or request aimed at the user: the answer, or the point to make
- a fact or number that sounds wrong: the correction
- a promise someone made: who, what, when, to note down
- a number, date or price: what to check or write down
Lead with the useful part. No preamble, and don't repeat the transcript back.
You cannot look anything up here. If a good answer needs the user's files, email or the web, say in one line what to ask the coach.
If you have nothing the user doesn't already know, reply with exactly ${NOTHING} and nothing else.
Reply in English even when the meeting is in another language.`;

export const OLD_TRIAGE_SYSTEM = `You decide whether a live meeting coach should interrupt the user right now with a short note. "You" in the lines is the user.
Say yes only when the user could act on it right now:
- a question or request aimed at the user that is still open and needs an answer or a fact from them
- a fact, number or claim that sounds wrong and the user may want to correct
- a promise someone made, the user included (who, what, when), worth noting
- a number, date or price the user should check or write down
Say no to small talk, greetings, back-channel ("yeah", "right", "you know?"), rhetorical questions, anything already answered, questions the user asked, and anything the user could not act on now. When unsure, say no.
Reply with only this JSON: {"nudge": true or false, "why": "at most 12 words"}`;

const INSTRUCTIONS_HEADING = "Instructions from the user, who set them in the app's settings:";

export function oldNudgeSystem(instructions: string): string {
  const own = instructions.trim();
  return own ? `${OLD_NUDGE_SYSTEM}\n\n${INSTRUCTIONS_HEADING}\n${own}` : OLD_NUDGE_SYSTEM;
}

export function oldCoachAppend(instructions: string): string {
  return instructions.trim() ? `${OLD_COACH_PROMPT}\n\n${INSTRUCTIONS_HEADING}\n${instructions}` : OLD_COACH_PROMPT;
}

const MOMENT: Record<HitKind, string> = {
  question: "a question aimed at the user",
  name: "someone said the user's name",
  commitment: "a commitment",
  number: "a number, date or price",
  objection: "pushback",
  monologue: "the user talking for a long stretch",
};

export function oldNudgeMessage(input: { context: string; hits: readonly Hit[]; why: string; lines: readonly TranscriptLine[] }) {
  const byLine = new Map<number, Hit[]>();
  for (const hit of input.hits) byLine.set(hit.lineIndex, [...(byLine.get(hit.lineIndex) ?? []), hit]);
  const moments = [...byLine.values()]
    .slice(-3)
    .map((group) => `- ${group.map((hit) => MOMENT[hit.kind]).join(", ")}: "${group[0]?.text.trim() ?? ""}"`)
    .join("\n");
  const latestEnd = input.lines.at(-1)?.end_ms ?? 0;
  const recent = input.lines.filter((line) => line.end_ms >= latestEnd - 3 * 60_000);
  return `Meeting: ${input.context}
Flagged moment:
${moments}
Flagged because: ${input.why}
The last 3 minutes:
${renderLines(recent) || "(nothing yet)"}`;
}
