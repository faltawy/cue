import { z } from "zod";

export const ACTION_ITEMS_MAX = 30;
export const ACTION_TEXT_MAX = 300;
export const REPLY_TEXT_MAX = 60;

const line = (max: number) => z.string().trim().min(1).max(max);

const actionItemSchema = z.strictObject({
  text: line(ACTION_TEXT_MAX),
  owner: line(80).optional(),
  due: line(60).optional(),
});

export const blockSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("actions"), items: z.array(actionItemSchema).min(1).max(ACTION_ITEMS_MAX) }),
  z.strictObject({ kind: z.literal("replies"), options: z.array(line(REPLY_TEXT_MAX)).min(2).max(3) }),
]);

export type Block = z.infer<typeof blockSchema>;
export type ActionItem = Extract<Block, { kind: "actions" }>["items"][number];

export const showInputShape = { block: blockSchema };

const SELF = /^(you|me|i|myself)$/i;

export function actionItemText(item: ActionItem): string {
  const owner = item.owner && !SELF.test(item.owner) ? `${item.owner}: ` : "";
  return `${owner}${item.text}${item.due ? ` (${item.due})` : ""}`;
}
