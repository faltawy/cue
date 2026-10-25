import { useRef } from "react";

import { commands as coach, events } from "@anlg/plugin-coach";
import { commands as dictation } from "@anlg/plugin-dictation";
import { commands as permissions } from "@anlg/plugin-permissions";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";

import { createCoachDictation } from "./dictation";

import { transcribeDictation } from "~/dictation/transcribe";
import { useSettingsReady } from "~/settings/queries";
import { useConfigValue } from "~/shared/config";
import { useRunBatch } from "~/stt/useRunBatch";

function unwrap<T>(
  result: { status: "ok"; data: T } | { status: "error"; error: string },
): T {
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

export function CoachDictationLifecycle() {
  const ready = useSettingsReady();
  return ready ? <ActiveCoachDictation /> : null;
}

function ActiveCoachDictation() {
  const id = useRef(`coach-dictation-${crypto.randomUUID()}`).current;
  const runBatch = useRunBatch(id);
  const microphone = useConfigValue("microphone_device");
  const current = useRef({ runBatch, microphone });
  current.current = { runBatch, microphone };

  useMountEffect(() => {
    let disposed = false;
    const recorder = createCoachDictation({
      start: async (owner) => {
        const permission = unwrap(
          await permissions.checkPermission("microphone"),
        );
        if (permission !== "authorized")
          throw new Error(
            "Enable microphone permission in Settings > Permissions before dictating.",
          );
        if (disposed) throw new Error("Dictation cancelled.");
        unwrap(
          await dictation.startRecording(
            current.current.microphone || null,
            owner,
          ),
        );
      },
      stop: async (owner) => unwrap(await dictation.stopRecording(owner)),
      cancel: async (owner) => {
        unwrap(await dictation.cancelRecording(owner));
      },
      discard: async (path) => {
        unwrap(await dictation.discardRecording(path));
      },
      transcribe: (path, signal) =>
        transcribeDictation(current.current.runBatch, path, signal),
    });
    const listening = events.coachDictationRequested.listen(({ payload }) => {
      if (disposed) return;
      void recorder
        .request(payload.recording_id, payload.action)
        .then(
          (text) =>
            coach.completeDictation(payload.request_id, { status: "ok", text }),
          (error: unknown) =>
            coach.completeDictation(payload.request_id, {
              status: "error",
              error: error instanceof Error ? error.message : String(error),
            }),
        )
        .catch((error: unknown) =>
          console.error("[coach] dictation response failed", error),
        );
    });
    return () => {
      disposed = true;
      void listening.then((unlisten) => unlisten());
      void recorder.dispose();
    };
  });
  return null;
}
