import { Microphone, MicrophoneSlash } from "@anlg/ui/components/icons";
import { DropdownMenuItem } from "@anlg/ui/components/ui/dropdown-menu";

import {
  BatchSessionMode,
  LiveSessionStatus,
} from "~/store/zustand/listener/enums";
import { useListener } from "~/stt/contexts";
import { ListenerControlAction } from "~/stt/enums";
import { useStartListeningWithBatchOverride } from "~/stt/useStartListeningWithBatchOverride";
import {
  isMainWebviewWindow,
  requestMainListenerControl,
} from "~/stt/window-control";

export function Listening({
  sessionId,
  resume,
}: {
  sessionId: string;
  resume: boolean;
}) {
  const { mode, stop } = useListener((state) => ({
    mode: state.getSessionMode(sessionId),
    stop: state.stop,
  }));
  const isListening =
    mode === LiveSessionStatus.Active || mode === LiveSessionStatus.Finalizing;
  const isFinalizing = mode === LiveSessionStatus.Finalizing;
  const isBatching = mode === BatchSessionMode.RunningBatch;
  const startListening = useStartListeningWithBatchOverride(sessionId);

  const handleToggleListening = () => {
    if (!isMainWebviewWindow()) {
      void requestMainListenerControl(
        isListening ? ListenerControlAction.Stop : ListenerControlAction.Start,
        sessionId,
      );
      return;
    }

    if (isListening) {
      stop();
    } else {
      void startListening();
    }
  };

  const startLabel =
    resume || isBatching ? "Resume listening" : "Start listening";

  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={handleToggleListening}
      disabled={isFinalizing}
    >
      {isListening ? <MicrophoneSlash /> : <Microphone />}
      <span>{isListening ? "Stop listening" : startLabel}</span>
    </DropdownMenuItem>
  );
}
