import { z } from "zod";

import {
  MeetingIntent,
  meetingIntentSchema,
} from "../src/coaching-preferences";
import { detectHits, type Hit } from "../src/detect";
import { NudgeDelivery } from "../src/nudge";
import { monologueNudge, PROACTIVE_DEFAULTS } from "../src/proactive";
import { type TranscriptLine } from "../src/transcript";
import data from "./moments.json";

export enum EvalTrigger {
  Lines = "lines",
  Monologue = "monologue",
}

export enum EvalKind {
  Nudge = "nudge",
  Ask = "ask",
}

const momentSchema = z.object({
  id: z.string(),
  kind: z.enum(EvalKind).default(EvalKind.Nudge),
  trigger: z.enum(EvalTrigger).default(EvalTrigger.Lines),
  lang: z.enum(["en", "ar"]),
  type: z.string(),
  context: z.string(),
  intent: meetingIntentSchema.default(MeetingIntent.General),
  delivery: z.enum(NudgeDelivery).optional(),
  instructions: z.string().default(""),
  startMin: z.number(),
  lines: z
    .array(
      z.union([
        z.tuple([z.string(), z.string()]),
        z.tuple([z.string(), z.string(), z.number()]),
      ]),
    )
    .min(1),
  flag: z.number().int().min(1).default(1),
  why: z.string().default(""),
  ask: z.string().optional(),
  silent: z.boolean(),
  good: z.string(),
});

export type Moment = z.infer<typeof momentSchema>;

const parsed = z
  .object({ self: z.string(), moments: z.array(momentSchema) })
  .parse(data);

export const SELF_NAME = parsed.self;
export const MOMENTS: readonly Moment[] = parsed.moments;

export function expectedDelivery(moment: Moment): NudgeDelivery {
  return (
    moment.delivery ??
    (moment.silent ? NudgeDelivery.Silent : NudgeDelivery.Now)
  );
}

const WORDS_PER_SECOND = 2.5;
const GAP_MS = 500;

export function momentLines(moment: Moment): TranscriptLine[] {
  let at = moment.startMin * 60_000;
  return moment.lines.map(([speaker, text, seconds]) => {
    const duration =
      (seconds ?? Math.max(2, text.split(/\s+/).length / WORDS_PER_SECOND)) *
      1_000;
    const line = {
      speaker,
      channel: speaker === "You" ? 0 : 1,
      start_ms: at,
      end_ms: at + duration,
      text,
    };
    at += duration + GAP_MS;
    return line;
  });
}

export function momentHits(
  moment: Moment,
  lines: readonly TranscriptLine[],
): Hit[] {
  if (moment.trigger === EvalTrigger.Monologue) {
    const stretch = monologueNudge(lines, PROACTIVE_DEFAULTS.monologueMs);
    return stretch ? [stretch.hit] : [];
  }
  return lines.flatMap((line, index) =>
    index >= lines.length - moment.flag
      ? detectHits(line, index, SELF_NAME)
      : [],
  );
}

export function momentWhy(
  moment: Moment,
  lines: readonly TranscriptLine[],
): string {
  if (moment.trigger !== EvalTrigger.Monologue) return moment.why;
  return (
    monologueNudge(lines, PROACTIVE_DEFAULTS.monologueMs)?.why ?? moment.why
  );
}
