import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

import { MeetingPhase } from "./lifecycle";
import { probeMeeting } from "./meeting-probe";

test("recovers an invalidated page script and distinguishes an unreachable page from a lobby", async () => {
  let loaded = false;
  let phase = MeetingPhase.InMeeting;
  const api = {
    tabs: {
      sendMessage: async () => {
        if (!loaded) throw new Error("Receiving end does not exist");
        return { phase };
      },
    },
    scripting: {
      executeScript: async () => {
        loaded = true;
      },
    },
  } as unknown as typeof chrome;
  expect(await probeMeeting(42, api)).toBe(MeetingPhase.InMeeting);
  phase = MeetingPhase.Lobby;
  expect(await probeMeeting(42, api)).toBe(MeetingPhase.Lobby);
  loaded = false;
  api.scripting.executeScript = async () => {
    throw new Error("Cannot access tab");
  };
  await rejects(probeMeeting(42, api), { code: "MEET_PAGE_UNREACHABLE" });
});
