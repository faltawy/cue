import { z } from "zod";

import { runLlm } from "./llm";
import { MOVE_VERBS } from "./move";
import { talkStats, talkSummary } from "./talk-time";
import { type LiveTranscript, type MeetingInfo, renderTranscript } from "./transcript";

export const wrapUpSchema = z.object({
  commitments: z.array(
    z.object({
      who: z.string(),
      what: z.string(),
      when: z.string().nullable(),
    }),
  ),
  open_questions: z.array(z.string()),
  follow_up_draft: z.string(),
  coaching: z.object({
    went_well: z.array(z.string()),
    next_time: z.array(
      z.object({
        moment: z.object({ speaker: z.string(), at: z.string().nullable(), quote: z.string() }),
        headline: z.string(),
        verb: z.enum(MOVE_VERBS),
        line: z.string(),
      }),
    ),
  }),
});

export type WrapUp = z.infer<typeof wrapUpSchema>;
export type Commitment = WrapUp["commitments"][number];

export const WRAP_UP_SYSTEM =`You write the wrap-up of a meeting that just ended, from its transcript.
"You" in the transcript is the user; other speakers appear by name, as "Speaker N", or as "Them".
Write every field in the meeting's main language, the one most of the transcript is in, except each coaching headline, which is in English.
- commitments: every concrete promise made in the meeting. who = the person who promised: "You" for the user, otherwise their name, taken from the invite list when the transcript only says "Them" and there is a single other invitee; keep "Them" only when you cannot tell. what = the promised action in a few words, when = the stated deadline in the speaker's words, or null.
- open_questions: questions raised and left unanswered, one line each.
- follow_up_draft: a short follow-up message in the user's own voice (first person) to the other participants: a one-line thanks, the agreed next steps with owners, and the open questions. Never write speaker labels such as "You:" or "Them:" in it. Plain text, no subject line, written in the meeting's main language.
- coaching: short, specific feedback for the user on how they ran this meeting, so they do better next time. Judge only the user ("You"), from the transcript only.
  went_well: one or two things the user did well, each naming the moment.
  next_time: two or three changes, biggest impact first. moment = what happened: speaker = who said it ("You" for the user), at = its timestamp as mm:ss without brackets (null if unclear), quote = their words, verbatim and short, e.g. Marco, "12:40", "that's more than we budgeted". headline = what to do differently, in under 10 words, in English. verb = "Say" or "Ask", line = the words they could have used, in the meeting's main language, without quotation marks.
  Look for what a strong coach would: questions the user left unanswered or never asked, pushback handled or dodged, vague commitments left open, promising what they can't confirm, conceding without getting something back, the user talking far more than the others (see the talk time), decisions without an owner, a meeting that ended without a clear next step. No generic advice. Leave both lists empty when the meeting was too short or the user barely spoke.
Never invent commitments or deadlines that were not said.`;

const WENT_WELL_MAX = 2;
const NEXT_TIME_MAX = 3;

export function wrapUpPrompt(transcript: LiveTranscript, info: MeetingInfo | null): string {
  const participants = info?.participants
    .map((participant) => participant.name || participant.email)
    .filter(Boolean)
    .join(", ");
  const stats = talkStats(transcript.lines, Number.POSITIVE_INFINITY);
  return `${participants ? `Invited: ${participants}\n\n` : ""}${stats ? `${talkSummary(stats)}\n\n` : ""}${renderTranscript(transcript)}`;
}

export function commitmentText(commitment: Commitment): string {
  const owner = commitment.who.trim() && commitment.who.trim() !== "You" ? `${commitment.who.trim()}: ` : "";
  const when = commitment.when?.trim() ? ` (${commitment.when.trim()})` : "";
  return `${owner}${commitment.what.trim()}${when}`;
}

export function logToClientsPrompt(title: string | null, wrapUp: WrapUp): string {
  const list = wrapUp.commitments.map((commitment) => `- ${commitmentText(commitment)}`).join("\n");
  return `Log the promises from the meeting "${title ?? "Untitled"}" that just ended to the clients system with the mcp__clients__ tools. Find the client this meeting was with first; if you cannot tell which client it is, ask me instead of guessing. Promises:
${list}
Reply with one line per promise saying where it was logged.`;
}

export async function generateWrapUp(
  transcript: LiveTranscript,
  info: MeetingInfo | null,
  options: { model: string; claudePath?: string; signal: AbortSignal },
): Promise<WrapUp> {
  let output = "";
  for await (const event of runLlm(
    {
      model: options.model,
      system: WRAP_UP_SYSTEM,
      messages: [{ role: "user", content: [{ type: "text", text: wrapUpPrompt(transcript, info) }] }],
      schema: z.toJSONSchema(wrapUpSchema, { target: "draft-7" }),
    },
    options.signal,
    options.claudePath,
  )) {
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "text") output += event.delta;
  }
  return parseWrapUp(JSON.parse(output));
}

const sameText = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

function unique<T>(items: readonly T[], identity: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = identity(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function parseWrapUp(json: unknown): WrapUp {
  const wrapUp = wrapUpSchema.parse(json);
  return {
    ...wrapUp,
    commitments: unique(wrapUp.commitments, (commitment) => `${sameText(commitment.who)}\n${sameText(commitment.what)}`),
    open_questions: unique(wrapUp.open_questions, sameText),
    coaching: {
      went_well: wrapUp.coaching.went_well.slice(0, WENT_WELL_MAX),
      next_time: wrapUp.coaching.next_time.slice(0, NEXT_TIME_MAX),
    },
  };
}
