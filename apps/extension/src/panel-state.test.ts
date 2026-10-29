import { expect, test } from "bun:test";

import { MeetingPhase } from "./lifecycle";
import {
  AppLinkState,
  ConnectionState,
  panelStateForTab,
  type PanelState,
} from "./protocol";

test("another Meet tab cannot receive the connected meeting's chat binding or private cues", () => {
  const state: PanelState = {
    appLink: {
      status: AppLinkState.Online,
      host: "Cue",
      checkedAt: 100,
      latencyMs: 2,
      error: null,
      errorCode: null,
    },
    connection: ConnectionState.Connected,
    generation: "meeting-a",
    tabId: 10,
    title: "Private meeting",
    screens: true,
    phase: MeetingPhase.InMeeting,
    recordingTitle: "Recording",
    activeSession: "recording-a",
    coverage: null,
    error: null,
    errorCode: null,
    cues: [
      {
        sequence: 1,
        tag: "question",
        line: "Ask about the budget",
        receivedAt: 100,
      },
    ],
  };
  const owner = panelStateForTab(state, 10);
  expect(owner.generation).toBe("meeting-a");
  expect(owner.cues[0]?.line).toBe("Ask about the budget");
  const other = panelStateForTab(state, 20);
  expect(other.connection).toBe(ConnectionState.Ready);
  expect(other.appLink.status).toBe(AppLinkState.Online);
  expect(other.generation).toBeNull();
  expect(JSON.stringify(other)).not.toContain("Ask about the budget");
  expect(other.title).toBe("");
});
