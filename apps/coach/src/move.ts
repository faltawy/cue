import { z } from "zod";

export enum MoveVerb {
  Say = "Say",
  Ask = "Ask",
}

export enum MoveTag {
  OpenQuestion = "open_question",
  Pushback = "pushback",
  BuyingSignal = "buying_signal",
  Risk = "risk",
  VaguePromise = "vague_promise",
  OverPromise = "over_promise",
  GivingGround = "giving_ground",
  TalkTime = "talk_time",
  DecisionOwner = "decision_owner",
  Agenda = "agenda",
}

export const MOVE_TAGS = Object.values(MoveTag);

export enum FeedbackReason {
  AlreadyHandled = "already_handled",
  PoorTiming = "poor_timing",
  Irrelevant = "irrelevant",
  WrongLanguage = "wrong_language",
}
export const FEEDBACK_REASONS = Object.values(FeedbackReason);
export type CoachFeedback = {
  category: MoveTag;
  useful: boolean;
  reason?: FeedbackReason;
  momentId?: string;
};

export const evidenceTargetSchema = z.strictObject({
  sessionId: z.string().min(1),
  timestampMs: z.number().int().nonnegative(),
});
export type EvidenceTarget = z.infer<typeof evidenceTargetSchema>;

export function evidenceMomentId(target: EvidenceTarget): string {
  return `${target.sessionId}:${target.timestampMs}`;
}

export const MOVE_VERBS = Object.values(MoveVerb);
export const HEADLINE_MAX = 100;
export const LINE_MAX = 400;
export const WATCH_OUT_MAX = 120;
export const QUOTE_MAX = 300;
export const SPEAKER_MAX = 80;

const text = (max: number) => z.string().trim().min(1).max(max);

export const momentSchema = z.strictObject({
  speaker: text(SPEAKER_MAX),
  quote: text(QUOTE_MAX),
  at: z
    .string()
    .regex(/^\d{1,3}:\d{2}$/, "mm:ss as in the transcript, without brackets")
    .optional(),
});

export const moveFields = {
  tag: z.enum(MoveTag),
  headline: text(HEADLINE_MAX),
  verb: z.enum(MoveVerb),
  line: text(LINE_MAX),
  watch_out: text(WATCH_OUT_MAX).optional(),
};

export const moveSchema = z.strictObject({
  ...moveFields,
  moment: momentSchema.optional(),
  evidence: evidenceTargetSchema.optional(),
});

export type Moment = z.infer<typeof momentSchema>;
export type Move = z.infer<typeof moveSchema>;

export function moveText(
  move: Pick<Move, "headline" | "verb" | "line" | "watch_out">,
): string {
  return [
    move.headline,
    `${move.verb}: "${move.line}"`,
    ...(move.watch_out ? [move.watch_out] : []),
  ].join("\n");
}
