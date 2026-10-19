import { describe, expect, test } from "bun:test";

import type { CoachEvent } from "../protocol";
import { fixtureState } from "./fixtures";
import { type CoachState, initialState, isBusy, latestUndoable, reduce, suggestions, type Turn } from "./state";

function feed(events: CoachEvent[], start: CoachState = initialState): CoachState {
  return events.reduce((state, event) => reduce(state, { type: "event", event }), start);
}

function turns(state: CoachState): Turn[] {
  return state.items.filter((item): item is Turn => item.kind === "turn");
}

const tool = (id: string, label: string): CoachEvent => ({
  type: "tool",
  id,
  name: "Grep",
  label,
  activeLabel: label.replace("Searched", "Searching"),
  detail: null,
});

describe("chat state from the coach's events", () => {
  test("a question shows at once, and the coach's echo confirms it instead of adding a second one", () => {
    const sent = reduce(initialState, { type: "send", prompt: "What did Sara ask?" });
    expect(turns(sent).map((turn) => [turn.prompt, turn.status])).toEqual([["What did Sara ask?", "sending"]]);
    const echoed = feed([{ type: "user", kind: "ask", text: "What did Sara ask?" }], sent);
    expect(turns(echoed).map((turn) => [turn.prompt, turn.status])).toEqual([["What did Sara ask?", "running"]]);
  });

  test("a question the coach refused is taken back and explained", () => {
    const sent = reduce(initialState, { type: "send", prompt: "hello" });
    const failed = reduce(sent, { type: "send_failed", prompt: "hello", message: "The coach is starting." });
    expect(turns(failed)).toEqual([]);
    expect(failed.items).toMatchObject([{ kind: "notice", text: "The coach is starting." }]);
  });

  test("tool calls start running and finish with their result; text streams into the same answer", () => {
    const state = feed([
      { type: "user", kind: "ask", text: "Bcc?" },
      tool("t1", "Searched for “bcc”"),
      { type: "text", delta: "Yes, " },
      { type: "tool_result", id: "t1", ok: false, output: "no matches", durationMs: 1_200 },
      { type: "text", delta: "it's live." },
    ]);
    const [turn] = turns(state);
    expect(turn?.text).toBe("Yes, it's live.");
    expect(turn?.steps).toMatchObject([{ id: "t1", status: "failed", output: "no matches", durationMs: 1_200 }]);
    expect(isBusy(state)).toBe(true);
  });

  test("Stop leaves the answer so far and marks unfinished tools as stopped", () => {
    const state = feed([
      { type: "user", kind: "ask", text: "Bcc?" },
      tool("t1", "Searched for “bcc”"),
      { type: "done", seconds: 2, ok: false, silent: false, interrupted: true },
    ]);
    expect(turns(state)[0]).toMatchObject({ status: "stopped", steps: [{ status: "stopped" }] });
    expect(isBusy(state)).toBe(false);
  });

  test("a nudge with nothing to say disappears; one with something stays", () => {
    const quiet = feed([
      { type: "user", kind: "ask", text: "Earlier question" },
      { type: "done", seconds: 1, ok: true, silent: false, interrupted: false },
      { type: "user", kind: "nudge", text: "Question for you · 14:30" },
      tool("c1", "Read the transcript"),
      { type: "done", seconds: 3, ok: true, silent: true, interrupted: false },
    ]);
    expect(turns(quiet).map((turn) => turn.prompt)).toEqual(["Earlier question"]);

    const useful = feed([
      { type: "user", kind: "nudge", text: "Question for you · 14:35" },
      { type: "text", delta: "- Omar asked about WhatsApp." },
      { type: "done", seconds: 3, ok: true, silent: false, interrupted: false },
    ]);
    expect(turns(useful)).toMatchObject([{ ask: "nudge", status: "done" }]);
  });

  test("coach edits attach to the answer that made them; Undo applies to the newest one only", () => {
    const edit = (id: string): CoachEvent => ({
      type: "edit",
      edit: { id, session_id: "m1", kind: "add_action_item", summary: `item ${id}`, task_id: id },
    });
    const state = feed([
      { type: "user", kind: "ask", text: "Add two items" },
      edit("e1"),
      edit("e2"),
      { type: "done", seconds: 1, ok: true, silent: false, interrupted: false },
      edit("e3"),
    ]);
    expect(turns(state)[0]?.edits.map((item) => item.id)).toEqual(["e1", "e2"]);
    expect(state.items.at(-1)).toMatchObject({ kind: "edit", edit: { id: "e3" } });
    expect(latestUndoable(state)).toBe("e3");
    const undone = feed([{ type: "undone", id: "e3", summary: "item e3" }], state);
    expect(latestUndoable(undone)).toBe("e2");
  });

  test("a reconnect replays the chat from scratch instead of appending it twice", () => {
    const replay: CoachEvent[] = [
      { type: "user", kind: "ask", text: "Bcc?" },
      { type: "text", delta: "Yes." },
      { type: "done", seconds: 1, ok: true, silent: false, interrupted: false },
    ];
    const once = feed([{ type: "reset", reason: "sync" }, ...replay]);
    const twice = feed([{ type: "reset", reason: "sync" }, ...replay], once);
    expect(turns(twice)).toHaveLength(1);
    expect(turns(once)).toHaveLength(1);
  });

  test("a question from the coach opens and closes by id", () => {
    const asked = feed([
      { type: "question", id: "q1", questions: [{ question: "Tone?", header: "Tone", multiSelect: false, options: [] }] },
    ]);
    expect(asked.question?.id).toBe("q1");
    expect(feed([{ type: "question_closed", id: "other", answered: true }], asked).question?.id).toBe("q1");
    expect(feed([{ type: "question_closed", id: "q1", answered: true }], asked).question).toBeNull();
  });
});

describe("suggestions", () => {
  test("follow the meeting: during, after with a wrap-up, and before", () => {
    expect(suggestions("live")[0]).toBe("What did they just ask?");
    expect(suggestions("ended", true)[0]).toBe("Make the follow-up shorter");
    expect(suggestions("ended", false)[0]).toBe("Draft a follow-up");
    expect(suggestions("none")[0]).toBe("Help me prepare for a meeting");
    expect(suggestions("live")).not.toContain("Summarize the last 5 minutes");
  });

  test("the fixtures the preview and tests share are well-formed", () => {
    expect(turns(fixtureState("conversation"))).toHaveLength(3);
    expect(fixtureState("ended").wrapUp?.state).toBe("ready");
  });
});
