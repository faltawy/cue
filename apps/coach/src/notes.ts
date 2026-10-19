import type { Database } from "bun:sqlite";
import { z } from "zod";

type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Node[] };

const nodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.object({
    type: z.string().optional(),
    text: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(nodeSchema).optional(),
  }),
);

function textOf(node: Node): string {
  return node.text ?? (node.content ?? []).map(textOf).join("");
}

function render(node: Node, depth: number, out: string[]) {
  const indent = "  ".repeat(depth);
  switch (node.type) {
    case "taskItem": {
      const done = node.attrs?.status === "done" || node.attrs?.checked === true;
      const id = typeof node.attrs?.taskId === "string" ? node.attrs.taskId : "";
      const [first, ...rest] = node.content ?? [];
      out.push(`${indent}- [${done ? "x" : " "}] ${first ? textOf(first) : ""}${id ? ` (task_id: ${id})` : ""}`);
      for (const child of rest) render(child, depth + 1, out);
      return;
    }
    case "listItem": {
      const [first, ...rest] = node.content ?? [];
      out.push(`${indent}- ${first ? textOf(first) : ""}`);
      for (const child of rest) render(child, depth + 1, out);
      return;
    }
    case "heading":
      out.push(`${"#".repeat(Number(node.attrs?.level ?? 1))} ${textOf(node)}`);
      return;
    case "paragraph": {
      const text = textOf(node);
      if (text.trim()) out.push(`${indent}${text}`);
      return;
    }
    default:
      for (const child of node.content ?? []) render(child, depth, out);
  }
}

export function renderNote(body: string): string {
  if (!body.trim()) return "";
  const parsed = nodeSchema.safeParse(JSON.parse(body));
  if (!parsed.success) return "";
  const out: string[] = [];
  render(parsed.data, 0, out);
  return out.join("\n");
}

export function readMeetingNote(db: Database, sessionId: string): string {
  const row = db
    .query<{ body: string; body_format: string }, [string]>(
      `SELECT body, body_format FROM session_documents WHERE id = ? AND kind = 'note' AND deleted_at IS NULL`,
    )
    .get(sessionId);
  if (!row || !row.body.trim()) return "(the notes are empty)";
  if (row.body_format !== "prosemirror_json") return row.body;
  return renderNote(row.body) || "(the notes are empty)";
}
