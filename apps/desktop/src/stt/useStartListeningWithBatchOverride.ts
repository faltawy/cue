import { useCallback } from "react";

import { useListener } from "./contexts";
import { useStartListening } from "./useStartListening";

import { BatchSessionMode } from "~/store/zustand/listener/enums";

export function useStartListeningWithBatchOverride(sessionId: string) {
  const startListening = useStartListening(sessionId);
  const { getSessionMode, stopTranscription } = useListener((state) => ({
    getSessionMode: state.getSessionMode,
    stopTranscription: state.stopTranscription,
  }));

  return useCallback(async () => {
    if (getSessionMode(sessionId) === BatchSessionMode.RunningBatch) {
      await stopTranscription(sessionId);
    }

    await startListening();
  }, [getSessionMode, sessionId, startListening, stopTranscription]);
}
