import { z } from "zod";

export const MOVE_TAGS = [
  "open_question",
  "pushback",
  "buying_signal",
  "risk",
  "vague_promise",
  "over_promise",
  "giving_ground",
  "talk_time",
  "decision_owner",
  "agenda",
] as const;

export type MoveTag = (typeof MOVE_TAGS)[number];

export const MOVE_VERBS = ["Say", "Ask"] as const;
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
  tag: z.enum(MOVE_TAGS),
  headline: text(HEADLINE_MAX),
  verb: z.enum(MOVE_VERBS),
  line: text(LINE_MAX),
  watch_out: text(WATCH_OUT_MAX).optional(),
};

export const moveSchema = z.strictObject({ ...moveFields, moment: momentSchema.optional() });

export type Moment = z.infer<typeof momentSchema>;
export type Move = z.infer<typeof moveSchema>;
export type MoveVerb = Move["verb"];

export function moveText(move: Pick<Move, "headline" | "verb" | "line" | "watch_out">): string {
  return [move.headline, `${move.verb}: "${move.line}"`, ...(move.watch_out ? [move.watch_out] : [])].join("\n");
}
