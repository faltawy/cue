import { z } from "zod";

import { MoveVerb } from "./move";
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
        moment: z.object({
          speaker: z.string(),
          at: z.string().nullable(),
          quote: z.string(),
        }),
        headline: z.string(),
        verb: z.enum(MoveVerb),
        line: z.string(),
      }),
    ),
  }),
});

export type WrapUp = z.infer<typeof wrapUpSchema>;

export type Commitment = WrapUp["commitments"][number];
