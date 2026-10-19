import { describe, expect, test } from "bun:test";

import type { CoachEdit } from "./app-bridge";
import { actionItemText, type Block } from "./blocks";
import { showTool } from "./meeting-server";
import { addedBlockItem, appendHistory, type CoachEvent, findBlock } from "./protocol";

function show(input: unknown) {
  const shown: Block[] = [];
  const definition = showTool((block) => shown.push(block));
  return { shown, run: () => definition.handler(input as never, {}) };
}

describe("the show tool", () => {
  test("a checklist and a set of follow-ups reach the UI and the coach gets a short ack", async () => {
    const actions = show({
      block: { kind: "actions", items: [{ text: "send the Bcc steps", owner: "You", due: "today" }, { text: "confirm the CRM address", owner: "Sara" }] },
    });
    const ack = await actions.run();
    expect(ack.isError).toBeUndefined();
    expect(actions.shown).toEqual([
      { kind: "actions", items: [{ text: "send the Bcc steps", owner: "You", due: "today" }, { text: "confirm the CRM address", owner: "Sara" }] },
    ]);

    const replies = show({ block: { kind: "replies", options: ["Draft the reply", "Summarise for Slack"] } });
    expect((await replies.run()).isError).toBeUndefined();
    expect(replies.shown).toEqual([{ kind: "replies", options: ["Draft the reply", "Summarise for Slack"] }]);
  });

  test("a move reaches the UI with its tag, headline, line, watch-out and moment, and the coach is told not to repeat it", async () => {
    const block = {
      kind: "move",
      tag: "pushback",
      headline: "Ask what's behind the price concern",
      verb: "Ask",
      line: "Is it the total, or the timing?",
      watch_out: "Don't discount yet",
      moment: { speaker: "Marco", quote: "That's more than we budgeted.", at: "12:40" },
    };
    const attempt = show({ block });
    const ack = await attempt.run();
    expect(ack.isError).toBeUndefined();
    expect(ack.content[0]).toMatchObject({ text: expect.stringContaining("don't repeat it") });
    expect(attempt.shown).toEqual([block]);
    const { watch_out: _watch, moment: _moment, ...bare } = block;
    const minimal = show({ block: bare });
    expect((await minimal.run()).isError).toBeUndefined();
    expect(minimal.shown).toEqual([bare]);
  });

  const MOVE = { kind: "move", tag: "pushback", headline: "Probe the price", verb: "Ask", line: "What's behind it?" };

  test.each([
    ["a move with an unknown tag", { ...MOVE, tag: "objection" }],
    ["a move with a verb other than Say or Ask", { ...MOVE, verb: "Tell" }],
    ["a move without a line", { kind: "move", tag: "pushback", headline: "Probe the price", verb: "Ask" }],
    ["a move whose headline is a paragraph", { ...MOVE, headline: "x".repeat(101) }],
    ["a move whose line runs past 400 characters", { ...MOVE, line: "y".repeat(401) }],
    ["a moment time in brackets", { ...MOVE, moment: { speaker: "Marco", quote: "Too much", at: "[12:40]" } }],
    ["a moment without a speaker", { ...MOVE, moment: { quote: "Too much" } }],
    ["a move with markup fields", { ...MOVE, html: "<b>Ask</b>" }],
    ["an unknown kind", { kind: "html", html: "<b>hi</b>" }],
    ["one follow-up", { kind: "replies", options: ["Draft the reply"] }],
    ["four follow-ups", { kind: "replies", options: ["a", "b", "c", "d"] }],
    ["a blank follow-up", { kind: "replies", options: ["Draft the reply", "   "] }],
    ["an empty checklist", { kind: "actions", items: [] }],
    ["31 items", { kind: "actions", items: Array.from({ length: 31 }, (_, index) => ({ text: `item ${index}` })) }],
    ["an item without text", { kind: "actions", items: [{ owner: "Sara" }] }],
    ["an item with markup fields", { kind: "actions", items: [{ text: "send it", html: "<script>alert(1)</script>" }] }],
    ["a stray top-level field", { kind: "replies", options: ["a", "b"], style: "primary" }],
  ])("rejects %s and shows nothing", async (_name, block) => {
    const attempt = show({ block });
    const ack = await attempt.run();
    expect(ack.isError).toBe(true);
    expect(ack.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("Invalid block") });
    expect(attempt.shown).toEqual([]);
  });
});

describe("checklist items", () => {
  test("go into the notes with the owner first unless it's the user, and the due date last", () => {
    expect(actionItemText({ text: "send the pricing sheet", owner: "Sara", due: "Friday" })).toBe("Sara: send the pricing sheet (Friday)");
    expect(actionItemText({ text: "send the Bcc steps", owner: "You" })).toBe("send the Bcc steps");
    expect(actionItemText({ text: "book the follow-up" })).toBe("book the follow-up");
  });

  test("an item added to the notes stays added until its edit is undone", () => {
    const edit = (id: string): CoachEdit => ({ id, session_id: "m1", kind: "add_action_item", summary: id, task_id: id });
    const block: CoachEvent = { type: "block", id: "b1", block: { kind: "actions", items: [{ text: "a" }, { text: "b" }] } };
    const events: CoachEvent[] = [
      block,
      { type: "edit", edit: edit("e1"), block: { id: "b1", index: 1 } },
      { type: "edit", edit: edit("e2") },
    ];
    const history = events.reduce<CoachEvent[]>(appendHistory, []);
    expect(findBlock(history, "b1")).toEqual({ kind: "actions", items: [{ text: "a" }, { text: "b" }] });
    expect(addedBlockItem(history, { id: "b1", index: 1 })).toBe("e1");
    expect(addedBlockItem(history, { id: "b1", index: 0 })).toBeNull();
    const undone = appendHistory(history, { type: "undone", id: "e1", summary: "b" });
    expect(addedBlockItem(undone, { id: "b1", index: 1 })).toBeNull();
  });
});
