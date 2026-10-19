import { z } from "zod";

import type { HitKind } from "./detect";
import { jsonOf, runLlm } from "./llm";
import { NO_SPEND, type Spend, spendOf } from "./pricing";
import { renderLines, type TranscriptLine } from "./transcript";

export const TRIAGE_MODEL = "haiku";

export const TRIAGE_SYSTEM = `You decide whether a live meeting coach should interrupt the user right now with a short note. "You" in the lines is the user. The coach helps the user handle the moment better, not only with facts.
Say yes only when the user could act on it right now:
- a question or request aimed at the user, or at the group the user is in, that is still open
- pushback or hesitation (price, a competitor, "we tried this before"), a buying signal ("how soon could we start?") or a risk signal (a new decision maker, a budget review)
- a promise someone made, the user included (who, what, when), worth noting even when it is clear; or another speaker's promise left vague, with no owner or date
- the user promising a date, feature or discount, or giving ground without getting anything back
- a decision made without an owner, or a fact, number or claim that sounds wrong
- a number, date or price the user should check, write down or use
Say no to small talk, greetings, back-channel ("yeah", "right", "you know?"), rhetorical and tag questions ("…, right?"), the user saying they will check something during the call, anything already answered, questions the user asked, and anything the user could not act on now. When unsure, say no.
Reply with only this JSON: {"nudge": true or false, "why": "at most 12 words"}`;

const verdictSchema = z.object({ nudge: z.boolean(), why: z.string() });

export type TriageVerdict = z.infer<typeof verdictSchema>;
export type TriageRequest = { context: string; kinds: HitKind[]; lines: readonly TranscriptLine[] };
export type TriageResult = { verdict: TriageVerdict | null; spend: Spend };

export function triagePrompt(request: TriageRequest): string {
  return `Meeting: ${request.context}\nFlagged: ${request.kinds.join(", ")}\n${renderLines(request.lines)}`;
}

export function parseTriage(reply: string): TriageVerdict | null {
  const json = jsonOf(reply);
  const verdict = json.ok ? verdictSchema.safeParse(json.value) : null;
  if (verdict?.success) return verdict.data;
  console.error("[coach] triage reply was not the expected JSON; not nudging", {
    _e: verdict ? z.prettifyError(verdict.error) : json.ok ? "" : json.error,
    reply: reply.slice(0, 200),
  });
  return null;
}

export async function askTriage(
  request: TriageRequest,
  options: { signal: AbortSignal; claudePath?: string },
): Promise<{ reply: string; spend: Spend } | { error: string; spend: Spend }> {
  let reply = "";
  let spend = NO_SPEND;
  for await (const event of runLlm(
    {
      model: TRIAGE_MODEL,
      system: TRIAGE_SYSTEM,
      messages: [{ role: "user", content: [{ type: "text", text: triagePrompt(request) }] }],
    },
    options.signal,
    options.claudePath,
    { thinking: { type: "disabled" }, shortCache: true },
  )) {
    if (event.type === "text") reply += event.delta;
    else if (event.type === "done") spend = spendOf(TRIAGE_MODEL, event);
    else return { error: event.message, spend };
  }
  return { reply, spend };
}

export async function runTriage(
  request: TriageRequest,
  options: { signal: AbortSignal; claudePath?: string },
): Promise<TriageResult> {
  const answer = await askTriage(request, options);
  if ("error" in answer) {
    console.error("[coach] triage failed; not nudging", { _e: answer.error });
    return { verdict: null, spend: answer.spend };
  }
  return { verdict: parseTriage(answer.reply), spend: answer.spend };
}
