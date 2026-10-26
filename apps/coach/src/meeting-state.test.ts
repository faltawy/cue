import { describe, expect, test } from "bun:test";

import {
  StripState,
  isAnswering,
  type MeetingPointer,
  meetingChange,
  stripView,
  wrapUpActions,
} from "@anlg/assistant/meeting-state";
import { WrapUpState } from "@anlg/assistant/protocol";

const live: MeetingPointer = {
  sessionId: "acme",
  transcriptId: "t1",
  live: true,
};
const ended: MeetingPointer = { ...live, live: false };
const none = new Set<string>();

describe("meetingChange", () => {
  test("a recording starting in another meeting opens a fresh chat", () => {
    expect(
      meetingChange(
        ended,
        { sessionId: "globex", transcriptId: "t2", live: true },
        none,
      ).newChat,
    ).toBe(true);
    expect(meetingChange(null, live, none).newChat).toBe(true);
  });

  test("the same meeting keeps its chat, including a resumed recording, and an ended one never resets", () => {
    expect(meetingChange(live, live, none).newChat).toBe(false);
    expect(
      meetingChange(ended, { ...live, transcriptId: "t1b" }, none).newChat,
    ).toBe(false);
    expect(
      meetingChange(
        live,
        { sessionId: "globex", transcriptId: "t2", live: false },
        none,
      ).newChat,
    ).toBe(false);
    expect(meetingChange(live, null, none).newChat).toBe(false);
  });

  test("the wrap-up fires when the attached recording stops, once", () => {
    expect(meetingChange(live, ended, none).wrapUp).toBe(true);
    expect(meetingChange(live, ended, new Set(["t1"])).wrapUp).toBe(false);
  });

  test.each([
    ["still recording", live, live],
    ["already ended when the coach attached", ended, ended],
    [
      "a different recording ended",
      live,
      { sessionId: "globex", transcriptId: "t2", live: false },
    ],
    ["the recording disappeared", live, null],
  ])("no wrap-up when %s", (_, attached, next) => {
    expect(meetingChange(attached, next, none).wrapUp).toBe(false);
  });
});

describe("stripView", () => {
  test("shows the meeting only while it records", () => {
    expect(
      stripView({
        title: "Acme sync",
        live: true,
        startedAtMs: 1_000,
        endedAtMs: null,
      }),
    ).toEqual({
      state: StripState.Live,
      title: "Acme sync",
      startedAt: 1_000,
    });
    expect(
      stripView({
        title: "Acme sync",
        live: false,
        startedAtMs: 1_000,
        endedAtMs: 9_000,
      }),
    ).toEqual({
      state: StripState.Waiting,
      lastTitle: "Acme sync",
      endedAt: 9_000,
    });
    expect(stripView(null)).toEqual({
      state: StripState.Waiting,
      lastTitle: null,
      endedAt: null,
    });
  });
});

describe("wrapUpActions", () => {
  const ready = {
    appConnected: true,
    mcpServers: ["clients"],
    allowChanges: ["clients"],
    commitments: 2,
  };

  test("both actions are available with the app connected and a clients tool allowed to change data", () => {
    expect(wrapUpActions(ready)).toEqual({
      addActionItems: { enabled: true, hint: null },
      logToClients: { enabled: true, hint: null },
    });
  });

  test("logging to clients explains how to enable it when the tool is read-only or missing", () => {
    const readOnly = wrapUpActions({ ...ready, allowChanges: [] }).logToClients;
    const missing = wrapUpActions({
      ...ready,
      mcpServers: ["linear"],
      allowChanges: ["linear"],
    }).logToClients;

    expect(readOnly.enabled).toBe(false);
    expect(readOnly.hint).toContain("Turn on Allow changes for “clients”");
    expect(missing.enabled).toBe(false);
    expect(missing.hint).toContain("Add a tool named “clients”");
  });

  test("adding action items needs the app, and neither action runs with no commitments", () => {
    expect(
      wrapUpActions({ ...ready, appConnected: false }).addActionItems.enabled,
    ).toBe(false);
    expect(
      wrapUpActions({ ...ready, appConnected: false }).logToClients.enabled,
    ).toBe(true);
    const empty = wrapUpActions({ ...ready, commitments: 0 });
    expect(empty.addActionItems.enabled).toBe(false);
    expect(empty.logToClients.enabled).toBe(false);
  });
});

describe("isAnswering", () => {
  test("foreground answers, wrap-ups and background suggestions keep the app from restarting", () => {
    expect(isAnswering(true, null)).toBe(true);
    expect(
      isAnswering(false, { state: WrapUpState.Running, title: "Acme sync" }),
    ).toBe(true);
    expect(isAnswering(false, null, true)).toBe(true);
    expect(isAnswering(false, null, false)).toBe(false);
  });
});
