import { describe, expect, test } from "bun:test";

import { renderNote } from "./notes";

const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const task = (taskId: string, text: string, status: "todo" | "done") => ({
  type: "taskItem",
  attrs: { status, checked: status === "done", taskId, taskItemId: `i-${taskId}` },
  content: [paragraph(text)],
});

describe("renderNote", () => {
  test("shows headings, bullets and action items with their ids and done state", () => {
    const body = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Pricing" }] },
        paragraph("Sara wants annual billing"),
        { type: "bulletList", content: [{ type: "listItem", content: [paragraph("Seats: 40")] }] },
        { type: "taskList", content: [task("a1", "Send the sheet", "todo"), task("a2", "Book venue", "done")] },
      ],
    });

    expect(renderNote(body)).toBe(
      [
        "## Pricing",
        "Sara wants annual billing",
        "- Seats: 40",
        "- [ ] Send the sheet (task_id: a1)",
        "- [x] Book venue (task_id: a2)",
      ].join("\n"),
    );
  });

  test("an empty note renders as nothing", () => {
    expect(renderNote("")).toBe("");
    expect(renderNote(JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }))).toBe("");
  });
});
