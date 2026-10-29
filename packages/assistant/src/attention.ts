import { z } from "zod";

export enum AttentionTarget {
  Element = "element",
  Coach = "coach",
  Captions = "captions",
  Presentation = "presentation",
}

export const attentionSchema = z.object({
  id: z.string().uuid(),
  target: z.enum(AttentionTarget),
  elementId: z.string().uuid().optional(),
  line: z.string().trim().min(1).max(400),
  expiresAt: z.number(),
  automatic: z.boolean(),
});
export type Attention = z.infer<typeof attentionSchema>;
