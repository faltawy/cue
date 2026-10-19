import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  type ChatStore,
  emptyStore,
  loadChats,
  MAX_MEETINGS,
  planChat,
  remember,
  resumeFor,
  saveChats,
} from "./chat-store";
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

describe("remember", () => {
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
