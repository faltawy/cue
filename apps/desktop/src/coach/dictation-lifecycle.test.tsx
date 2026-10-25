import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type {
  CoachDictationRequested,
  DictationResult,
} from "@anlg/plugin-coach";

const state = vi.hoisted(() => ({
  listener: undefined as
    | ((event: { payload: CoachDictationRequested }) => void)
    | undefined,
  replies: new Map<string, DictationResult>(),
  microphone: null as { device: string | null; owner: string } | null,
  files: new Set<string>(),
}));

vi.mock("~/settings/queries", () => ({ useSettingsReady: () => true }));
vi.mock("~/shared/config", () => ({
  useConfigValue: (key: string) =>
    key === "microphone_device" ? "Desk microphone" : false,
}));
vi.mock("@anlg/plugin-coach", () => ({
  commands: {
    completeDictation: async (id: string, result: DictationResult) => {
      state.replies.set(id, result);
      return { status: "ok", data: null };
    },
  },
  events: {
    coachDictationRequested: {
      listen: async (listener: typeof state.listener) => {
        state.listener = listener;
        return () => {
          state.listener = undefined;
        };
      },
    },
  },
}));
vi.mock("@anlg/plugin-permissions", () => ({
  commands: {
    checkPermission: async () => ({ status: "ok", data: "authorized" }),
  },
}));
vi.mock("@anlg/plugin-dictation", () => ({
  commands: {
    startRecording: async (device: string | null, owner: string) => {
      state.microphone = { device, owner };
      return { status: "ok", data: null };
    },
    stopRecording: async (owner: string) => {
      expect(state.microphone?.owner).toBe(owner);
      state.microphone = null;
      state.files.add("/tmp/coach.wav");
      return {
        status: "ok",
        data: {
          filePath: "/tmp/coach.wav",
          durationMs: 1_000,
          transcript: null,
        },
      };
    },
    cancelRecording: async () => {
      state.microphone = null;
      return { status: "ok", data: null };
    },
    discardRecording: async (path: string) => {
      expect(state.files.has(path)).toBe(true);
      state.files.delete(path);
      return { status: "ok", data: null };
    },
  },
}));
vi.mock("~/stt/useRunBatch", () => ({
  useRunBatch:
    () =>
    async (
      path: string,
      options: {
        deferAudioFinalization: boolean;
        notifyOnCompletion: boolean;
        numSpeakers: number;
        handlePersist: (words: { text: string; start_ms: number }[]) => void;
      },
    ) => {
      expect(state.files.has(path)).toBe(true);
      expect(options.deferAudioFinalization).toBe(true);
      expect(options.notifyOnCompletion).toBe(false);
      expect(options.numSpeakers).toBe(1);
      options.handlePersist([
        { text: " ask?", start_ms: 900 },
        { text: "What did they", start_ms: 0 },
      ]);
    },
}));

import { CoachDictationLifecycle } from "./dictation-lifecycle";

afterEach(cleanup);

it("dictates through the selected microphone with global dictation disabled and returns a transient draft", async () => {
  render(<CoachDictationLifecycle />);
  await waitFor(() => expect(state.listener).toBeDefined());
  act(() =>
    state.listener!({
      payload: { request_id: "start", recording_id: "hold", action: "start" },
    }),
  );
  await waitFor(() =>
    expect(state.replies.get("start")).toEqual({ status: "ok", text: null }),
  );
  expect(state.microphone).toEqual({
    device: "Desk microphone",
    owner: "coach-dictation:hold",
  });
  act(() =>
    state.listener!({
      payload: { request_id: "stop", recording_id: "hold", action: "stop" },
    }),
  );
  await waitFor(() =>
    expect(state.replies.get("stop")).toEqual({
      status: "ok",
      text: "What did they ask?",
    }),
  );
  expect(state.files.has("/tmp/coach.wav")).toBe(false);
  expect(state.microphone).toBeNull();
});
