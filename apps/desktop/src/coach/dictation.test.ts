import { afterEach, describe, expect, it, vi } from "vitest";

import { createCoachDictation } from "./dictation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("coach dictation", () => {
  afterEach(() => vi.useRealTimers());

  it("discards empty capture before transcription and allows a subsequent spoken recording", async () => {
    let durationMs = 0;
    const recordings = new Set<string>();
    const dictation = createCoachDictation({
      start: async () => {},
      stop: async () => {
        recordings.add("/tmp/prompt.wav");
        return { filePath: "/tmp/prompt.wav", durationMs, transcript: null };
      },
      cancel: async () => {},
      transcribe: async (path) => {
        expect(recordings.has(path)).toBe(true);
        if (durationMs === 0) throw new Error("Invalid audio format");
        return "What should I ask next?";
      },
      discard: async (path) => {
        expect(recordings.has(path)).toBe(true);
        recordings.delete(path);
      },
    });

    await dictation.request("empty", "start");
    await expect(dictation.request("empty", "stop")).rejects.toThrow(
      "No speech detected",
    );
    expect(recordings.has("/tmp/prompt.wav")).toBe(false);

    durationMs = 1_000;
    await dictation.request("spoken", "start");
    expect(await dictation.request("spoken", "stop")).toBe(
      "What should I ask next?",
    );
    expect(recordings.has("/tmp/prompt.wav")).toBe(false);
    await dictation.dispose();
  });

  it("finishes an early release after microphone startup and discards the recording", async () => {
    const started = deferred<void>();
    let microphone: string | null = null;
    const recordings = new Set<string>();
    const dictation = createCoachDictation({
      start: async (owner) => {
        await started.promise;
        microphone = owner;
      },
      stop: async (owner) => {
        expect(microphone).toBe(owner);
        microphone = null;
        recordings.add("/tmp/prompt.wav");
        return {
          filePath: "/tmp/prompt.wav",
          durationMs: 1_000,
          transcript: null,
        };
      },
      cancel: async () => {
        microphone = null;
      },
      transcribe: async (path) => {
        expect(recordings.has(path)).toBe(true);
        return "What did they ask?";
      },
      discard: async (path) => {
        expect(recordings.has(path)).toBe(true);
        recordings.delete(path);
      },
    });

    const start = dictation.request("hold-1", "start");
    const stopped = dictation.request("hold-1", "stop");
    started.resolve();
    await start;
    expect(await stopped).toBe("What did they ask?");
    expect(recordings.has("/tmp/prompt.wav")).toBe(false);
    expect(microphone).toBeNull();
    await dictation.dispose();
  });

  it("cancels transcription without returning its late text and releases its audio", async () => {
    const transcription = deferred<string>();
    const transcribing = deferred<AbortSignal>();
    const recordings = new Set<string>();
    const dictation = createCoachDictation({
      start: async () => {},
      stop: async () => {
        recordings.add("/tmp/cancelled.wav");
        return {
          filePath: "/tmp/cancelled.wav",
          durationMs: 1_000,
          transcript: null,
        };
      },
      cancel: async () => {},
      transcribe: async (_, signal) => {
        transcribing.resolve(signal);
        return transcription.promise;
      },
      discard: async (path) => {
        expect(recordings.has(path)).toBe(true);
        recordings.delete(path);
      },
    });
    await dictation.request("hold-2", "start");
    const stopped = dictation.request("hold-2", "stop");
    const signal = await transcribing.promise;
    const cancelled = dictation.request("hold-2", "cancel");
    expect(signal.aborted).toBe(true);
    transcription.resolve("Do not insert this");
    await expect(stopped).rejects.toThrow("Dictation cancelled.");
    await cancelled;
    expect(recordings.has("/tmp/cancelled.wav")).toBe(false);
  });

  it("ignores another hold's cancel and releases an abandoned microphone after the deadline", async () => {
    vi.useFakeTimers();
    let microphone: string | null = null;
    const dictation = createCoachDictation({
      start: async (owner) => {
        microphone = owner;
      },
      stop: async () => ({
        filePath: "/tmp/unused.wav",
        durationMs: 1_000,
        transcript: null,
      }),
      cancel: async (owner) => {
        expect(microphone).toBe(owner);
        microphone = null;
      },
      transcribe: async () => "unused",
      discard: async () => {},
    });
    await dictation.request("hold-3", "start");
    expect(microphone).toBe("coach-dictation:hold-3");
    await dictation.request("stale-hold", "cancel");
    expect(microphone).toBe("coach-dictation:hold-3");
    await vi.advanceTimersByTimeAsync(65_000);
    expect(microphone).toBeNull();
    await dictation.request("hold-4", "start");
    expect(microphone).toBe("coach-dictation:hold-4");
    await dictation.dispose();
  });
});
