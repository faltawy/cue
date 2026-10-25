import {
  commands as transcriptionCommands,
  events as transcriptionEvents,
  type SessionAudioRetentionEvent,
} from "@anlg/plugin-transcription";

import { AudioRetentionPolicy } from "~/services/enums";
import { LiveSessionStatus } from "~/store/zustand/listener/enums";
import { listenerStore } from "~/store/zustand/listener/instance";

export {
  normalizeAudioRetention,
  type AudioRetentionPolicy,
} from "./audio-retention-policy";

export function subscribeToSessionAudioRetention(
  listener: (event: SessionAudioRetentionEvent) => void,
) {
  const unlisten = transcriptionEvents.sessionAudioRetentionEvent.listen(
    ({ payload }) => listener(payload),
  );
  return () => {
    void unlisten.then((stop) => stop());
  };
}

export function isSessionAudioIdle(sessionId: string) {
  const state = listenerStore.getState();
  return (
    state.getSessionMode(sessionId) === LiveSessionStatus.Inactive &&
    !(state.live.sessionId === sessionId && state.live.loading)
  );
}

export async function deleteProcessedAudioForRetention(
  policy: AudioRetentionPolicy,
  sessionId: string,
) {
  if (policy !== AudioRetentionPolicy.None || !isSessionAudioIdle(sessionId)) {
    return false;
  }

  try {
    const result =
      await transcriptionCommands.deleteProcessedSessionAudio(sessionId);
    if (result.status === "error") {
      throw new Error(result.error);
    }
    return result.data;
  } catch (error) {
    console.error("[audio-retention] failed to delete audio", {
      sessionId,
      error,
    });
    return false;
  }
}
