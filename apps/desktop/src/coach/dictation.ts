import type { DictationAction } from "@anlg/plugin-coach";
import type { RecordedAudio } from "@anlg/plugin-dictation";

import { DictationController, DictationPhase } from "~/dictation/controller";

export function createCoachDictation(dependencies: {
  start(owner: string): Promise<void>;
  stop(owner: string): Promise<RecordedAudio>;
  cancel(owner: string): Promise<void>;
  transcribe(path: string, signal: AbortSignal): Promise<string>;
  discard(path: string): Promise<void>;
}) {
  let active: ReturnType<typeof createSession> | undefined;

  function createSession(id: string) {
    const owner = `coach-dictation:${id}`;
    const abort = new AbortController();
    const result = { text: null as string | null, error: null as unknown };
    let transcript: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new DictationController({
      handsFree: false,
      start: () => dependencies.start(owner),
      stop: async () => {
        const recorded = await dependencies.stop(owner);
        transcript = recorded.durationMs === 0 ? "" : recorded.transcript;
        return recorded.filePath;
      },
      cancel: () => dependencies.cancel(owner),
      transcribe: (path) =>
        transcript === null
          ? dependencies.transcribe(path, abort.signal)
          : Promise.resolve(transcript),
      insert: async () => {},
      discard: (path) => dependencies.discard(path),
      onTranscript: (text) => {
        result.text = text;
      },
      onError: (error) => {
        result.error = error;
      },
      onPhase: (phase) => {
        clearTimeout(timer);
        if (phase === DictationPhase.Recording) {
          // The panel stops at 60s; this releases the mic if it disappears.
          timer = setTimeout(() => {
            abort.abort();
            void controller.cancel();
          }, 65_000);
        }
        if (phase === DictationPhase.Idle && active?.controller === controller)
          active = undefined;
      },
    });
    return { id, abort, controller, result };
  }

  return {
    async request(id: string, action: DictationAction) {
      if (action === "start") {
        if (active) throw new Error("Dictation is already in progress.");
        const session = createSession(id);
        active = session;
        await session.controller.press();
        if (session.result.error !== null) throw session.result.error;
        return null;
      }

      const session = active;
      if (!session || session.id !== id) {
        if (action === "cancel") return null;
        throw new Error(
          "Dictation has ended. Click the microphone to try again.",
        );
      }
      if (action === "cancel") {
        session.abort.abort();
        await session.controller.cancel();
        return null;
      }
      await session.controller.release();
      if (session.result.error !== null) throw session.result.error;
      if (session.abort.signal.aborted) throw new Error("Dictation cancelled.");
      return session.result.text;
    },
    async dispose() {
      const session = active;
      if (!session) return;
      session.abort.abort();
      await session.controller.cancel();
    },
  };
}
