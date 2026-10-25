import { Waveform } from "@anlg/ui/components/icons";

import { ListeningStatus } from "~/stt/enums";

export function TranscriptListeningState({
  status,
}: {
  status: ListeningStatus;
}) {
  const isFinalizing = status === ListeningStatus.Finalizing;

  return (
    <div
      role="status"
      className="flex h-full min-h-[400px] flex-col items-center justify-center px-6 text-center"
    >
      <Waveform aria-hidden className="text-muted-foreground mb-3 size-4" />
      <div className="flex max-w-[340px] flex-col gap-1">
        <p className={isFinalizing ? "text-title coach-sheen" : "text-title"}>
          {isFinalizing ? "Finalizing transcript..." : "Listening..."}
        </p>
        <p className="text-muted-foreground text-ui text-balance">
          {isFinalizing
            ? "Transcript is still being written."
            : "Transcript will appear here when the first segment arrives."}
        </p>
      </div>
    </div>
  );
}
