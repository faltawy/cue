import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  emptyStore,
  loadChats,
  planChat,
  remember,
  saveChats,
} from "./chat-store";
import {
  type MeetingNow,
  type MeetingSeen,
  meetingUpdate,
  userTurn,
} from "./meeting-context";

const MINUTE = 60_000;
const NOW = Date.parse("2026-10-20T15:00:00Z");

const pricing: MeetingNow = {
  id: "meeting-pricing",
  title: "Pilot Pricing",
  live: true,
  elsewhere: null,
  people: ["Sara"],
  startedAtMs: NOW - 12 * MINUTE,
  endedAtMs: null,
};
const pricingEnded: MeetingNow = {
  ...pricing,
  live: false,
  endedAtMs: NOW - 2 * 60 * MINUTE,
};
const weeklySync = { id: "meeting-weekly", title: "Weekly sync" };

describe("meetingUpdate", () => {
  test("the first turn of a chat names its meeting", () => {
    expect(meetingUpdate(undefined, pricing, NOW).line).toBe(
      '[Meeting: "Pilot Pricing" with Sara · live, 12 min in]',
    );
  });

  test("an unchanged meeting is not repeated, even as the minutes pass", () => {
    const first = meetingUpdate(undefined, pricing, NOW);
    expect(first.line).not.toBeNull();
    const second = meetingUpdate(first.seen, pricing, NOW + 5 * MINUTE);
    expect(second).toEqual({ line: null, seen: first.seen });
  });

  test("the meeting ending since the last turn is announced", () => {
    const { seen } = meetingUpdate(undefined, pricing, NOW);
    expect(meetingUpdate(seen, pricingEnded, NOW).line).toBe(
      '[Meeting: "Pilot Pricing" with Sara · ended 2h ago]',
    );
  });

  test("a different meeting recording now is named, and the tools stay on the chat's meeting", () => {
    const { seen } = meetingUpdate(undefined, pricingEnded, NOW);
    expect(
      meetingUpdate(seen, { ...pricingEnded, elsewhere: weeklySync }, NOW).line,
    ).toBe(
      '[This chat is about "Pilot Pricing" (ended 2h ago). The user is now in a different meeting: "Weekly sync" (live). Your meeting tools act on "Pilot Pricing".]',
    );
  });

  test("with no meeting there is nothing to say", () => {
    expect(meetingUpdate(undefined, null, NOW)).toEqual({
      line: null,
      seen: undefined,
    });
  });
});

describe("after a restart", () => {
  const project = "/work/northwind";
  const live = { sessionId: pricing.id, live: true };
  const current = { runtimeSessionId: null, project, history: [] };

  function restartWith(seen: MeetingSeen | undefined) {
    const file = path.join(
      mkdtempSync(path.join(os.tmpdir(), "coach-seen-")),
      "coach-chats.json",
    );
    const stored = remember(emptyStore(), pricing.id, {
      runtimeSessionId: "claude-1",
      project,
      history: [],
      updatedAt: 1,
      seen,
    });
    saveChats(file, stored);
    return planChat({
      reason: "startup",
      store: loadChats(file),
      meeting: live,
      project,
      current,
    });
  }

  test("the first turn of a resumed chat that never recorded its meeting gets the line", () => {
    const plan = restartWith(undefined);
    expect(plan.resume).toBe("claude-1");
    expect(meetingUpdate(plan.seen, pricing, NOW).line).toBe(
      '[Meeting: "Pilot Pricing" with Sara · live, 12 min in]',
    );
  });

  test("the first turn of a resumed chat gets the line when another meeting is recording now", () => {
    const plan = restartWith(meetingUpdate(undefined, pricing, NOW).seen);
    expect(
      meetingUpdate(plan.seen, { ...pricing, elsewhere: weeklySync }, NOW).line,
    ).toContain('The user is now in a different meeting: "Weekly sync" (live)');
  });

  test("a resumed chat whose meeting the model already saw as it is now is not told again", () => {
    const seen = meetingUpdate(undefined, pricing, NOW).seen;
    const plan = restartWith(seen);
    expect(plan.seen).toEqual({
      id: pricing.id,
      title: "Pilot Pricing",
      live: true,
      elsewhere: null,
    });
    expect(meetingUpdate(plan.seen, pricing, NOW).line).toBeNull();
    expect(meetingUpdate(plan.seen, pricingEnded, NOW).line).not.toBeNull();
  });
});

describe("userTurn", () => {
  test("the meeting line reaches the model but not the chat the user sees", () => {
    const line = '[Meeting: "Pilot Pricing" with Sara · live, 12 min in]';
    const turn = userTurn({
      kind: "ask",
      label: "What did Sara ask?",
      prompt: "What did Sara ask?",
      line,
      images: [],
    });
    expect(turn.event).toEqual({
      type: "user",
      kind: "ask",
      text: "What did Sara ask?",
    });
    expect(turn.content).toBe(`${line}\n\nWhat did Sara ask?`);
  });

  test("without a line the prompt goes as is", () => {
    const turn = userTurn({
      kind: "catchup",
      label: "Catch me up · 15:00",
      prompt: "Catch up.",
      line: null,
      images: [],
    });
    expect(turn.event).toEqual({
      type: "user",
      kind: "catchup",
      text: "Catch me up · 15:00",
    });
    expect(turn.content).toBe("Catch up.");
  });
});
