import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  type ChatStore,
  dropResume,
  emptyStore,
  keepWrapUp,
  loadChats,
  MAX_MEETINGS,
  planChat,
  remember,
  resumeFor,
  saveChats,
  type SettledWrapUp,
  wrappedTranscripts,
} from "./chat-store";
import { meetingChange } from "./meeting-state";
import type { CoachEvent } from "./protocol";

const asked: CoachEvent[] = [
  { type: "user", kind: "ask", text: "What did Sara ask?" },
  { type: "text", delta: "About the Bcc option." },
];

function storeWith(meeting: string, project: string, claudeSessionId = "claude-1"): ChatStore {
  return remember(emptyStore(), meeting, { claudeSessionId, project, history: asked, updatedAt: 1 });
}

describe("resumeFor", () => {
  const store = storeWith("meeting-a", "/work/northwind");

  test("resumes the meeting's chat when the same meeting is still recording in the same project", () => {
    expect(resumeFor(store, { sessionId: "meeting-a", live: true }, "/work/northwind")?.claudeSessionId).toBe("claude-1");
  });

  test.each([
    ["the meeting ended", { sessionId: "meeting-a", live: false }, "/work/northwind"],
    ["another meeting", { sessionId: "meeting-b", live: true }, "/work/northwind"],
    ["the series now uses another folder", { sessionId: "meeting-a", live: true }, "/work/clients"],
    ["no meeting", null, "/work/northwind"],
  ] as const)("starts fresh when %s", (_case, meeting, project) => {
    expect(resumeFor(store, meeting, project)).toBeNull();
  });
});

describe("planChat", () => {
  const store = storeWith("meeting-a", "/work/northwind");
  const live = { sessionId: "meeting-a", live: true };
  const current = { claudeSessionId: "claude-live", project: "/work/northwind", history: asked };

  test("after a restart mid-meeting, the coach resumes with its history", () => {
    const plan = planChat({ reason: "startup", store, meeting: live, project: "/work/northwind", current });
    expect(plan.resume).toBe("claude-1");
    expect(plan.history).toEqual(asked);
  });

  test("New chat forgets the meeting's chat, so a later restart doesn't bring it back", () => {
    const plan = planChat({ reason: "manual", store, meeting: live, project: "/work/northwind", current });
    expect(plan).toEqual({ store: emptyStore(), resume: null, history: [] });
    expect(planChat({ reason: "startup", store: plan.store, meeting: live, project: "/work/northwind", current }).resume).toBeNull();
  });

  test("recovering without a resumable session starts fresh but keeps what the user already sees", () => {
    const plan = planChat({
      reason: "recover",
      store,
      meeting: live,
      project: "/work/northwind",
      current: { ...current, claudeSessionId: null },
    });
    expect(plan.resume).toBeNull();
    expect(plan.history).toBe(asked);
    const moved = planChat({ reason: "recover", store, meeting: live, project: "/work/elsewhere", current });
    expect(moved).toEqual({ store, resume: null, history: [] });
  });

  test("recovering from a crash continues the current chat, not the stored one", () => {
    const plan = planChat({ reason: "recover", store, meeting: live, project: "/work/northwind", current });
    expect(plan.resume).toBe("claude-live");
    expect(plan.history).toBe(asked);
  });
});

describe("after the app restarts", () => {
  const nudged: CoachEvent[] = [
    { type: "user", kind: "nudge", text: "Open question · 11:02" },
    {
      type: "block",
      id: "move-1",
      block: { kind: "move", tag: "open_question", headline: "Pin the renewal date", verb: "Ask", line: "When do you renew?" },
    },
    { type: "done", seconds: 4, ok: true, silent: false, interrupted: false },
  ];
  const ready: SettledWrapUp = {
    state: "ready",
    title: "Northwind renewal",
    wrapUp: {
      commitments: [{ who: "You", what: "Send the renewal quote", when: "Friday" }],
      open_questions: ["Who signs off on the budget?"],
      follow_up_draft: "Thanks for the time today.",
      coaching: { went_well: [], next_time: [] },
    },
    commitments: ["You: Send the renewal quote (Friday)"],
    actions: {
      addActionItems: { enabled: true, hint: null },
      logToClients: { enabled: false, hint: "Add a tool" },
    },
    added: true,
    logged: false,
    talk: null,
  };
  const project = "/work/northwind";
  const current = { claudeSessionId: null, project, history: [] };
  const live = { sessionId: "meeting-a", live: true };
  const ended = { ...live, live: false };

  function restarted(store: ChatStore): ChatStore {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "coach-chats-")), "coach-chats.json");
    saveChats(file, store);
    return loadChats(file);
  }

  function reopen(store: ChatStore, meeting: { sessionId: string; live: boolean }) {
    return planChat({ reason: "startup", store, meeting, project, current });
  }

  test("a chat with only nudges, never asked anything, keeps its nudges", () => {
    const store = restarted(
      remember(emptyStore(), "meeting-a", { claudeSessionId: null, project, history: nudged, updatedAt: 1 }),
    );
    const plan = reopen(store, ended);
    expect(plan.history).toEqual(nudged);
    expect(plan.resume).toBeNull();
  });

  test("a finished wrap-up comes back with its meeting and is not generated again", () => {
    const store = restarted(keepWrapUp(emptyStore(), "meeting-a", { transcriptId: "t1", view: ready, updatedAt: 1 }));
    expect(reopen(store, ended).wrapUp).toEqual({ transcriptId: "t1", view: ready, updatedAt: 1 });
    expect(reopen(store, { sessionId: "meeting-b", live: false }).wrapUp).toBeUndefined();

    const recording = { sessionId: "meeting-a", transcriptId: "t1", live: true };
    const stopped = { ...recording, live: false };
    expect(meetingChange(recording, stopped, new Set()).wrapUp).toBe(true);
    expect(meetingChange(recording, stopped, wrappedTranscripts(store)).wrapUp).toBe(false);
  });

  test("a chat with a resumable session resumes it with its history", () => {
    const plan = reopen(restarted(storeWith("meeting-a", project)), live);
    expect(plan.resume).toBe("claude-1");
    expect(plan.history).toEqual(asked);
  });

  test("a chat whose session Claude Code lost starts a fresh session but keeps what the user saw", () => {
    const seen = { id: "meeting-a", title: "Northwind renewal", live: true, elsewhere: null };
    const stored = remember(emptyStore(), "meeting-a", {
      claudeSessionId: "claude-1",
      project,
      history: asked,
      updatedAt: 1,
      seen,
    });
    expect(reopen(restarted(stored), live).seen).toEqual(seen);

    const plan = reopen(restarted(dropResume(stored, "meeting-a")), live);
    expect(plan.resume).toBeNull();
    expect(plan.history).toEqual(asked);
    expect(plan.seen).toBeUndefined();
  });
});

describe("remember", () => {
  test("skips a chat with nothing to show and nothing to resume", () => {
    const chat = { claudeSessionId: null, project: "/p", updatedAt: 1 };
    expect(remember(emptyStore(), "meeting-a", { ...chat, history: [] }).meetings).toEqual({});
    expect(Object.keys(remember(emptyStore(), "meeting-a", { ...chat, history: asked }).meetings)).toEqual(["meeting-a"]);
  });

  test("keeps the newest wrap-ups only", () => {
    let store = emptyStore();
    const view = { state: "failed", title: null, message: "Claude Code timed out" } as const;
    for (let index = 0; index < MAX_MEETINGS + 5; index += 1) {
      store = keepWrapUp(store, `m${index}`, { transcriptId: `t${index}`, view, updatedAt: index });
    }
    const kept = Object.keys(store.wrapUps);
    expect(kept).toHaveLength(MAX_MEETINGS);
    expect(kept).toContain(`m${MAX_MEETINGS + 4}`);
    expect(kept).not.toContain("m0");
  });

  test("keeps the newest meetings only", () => {
    let store = emptyStore();
    for (let index = 0; index < MAX_MEETINGS + 5; index += 1) {
      store = remember(store, `m${index}`, { claudeSessionId: `c${index}`, project: "/p", history: [], updatedAt: index });
    }
    const kept = Object.keys(store.meetings);
    expect(kept).toHaveLength(MAX_MEETINGS);
    expect(kept).toContain(`m${MAX_MEETINGS + 4}`);
    expect(kept).not.toContain("m0");
  });
});

describe("the chat file", () => {
  test("round-trips, is private to the user, and an unreadable file starts empty", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "coach-chats-"));
    const file = path.join(dir, "nested", "coach-chats.json");
    const store = storeWith("meeting-a", "/work/northwind");
    saveChats(file, store);
    expect(loadChats(file)).toEqual(store);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(file, "utf8")).meetings["meeting-a"].claudeSessionId).toBe("claude-1");

    writeFileSync(file, "{not json");
    expect(loadChats(file)).toEqual(emptyStore());
    expect(loadChats(path.join(dir, "missing.json"))).toEqual(emptyStore());
  });
});
