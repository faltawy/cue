import { DancingSticks } from "@anlg/ui/components/ui/dancing-sticks";

import { LiveTranscriptInterruptedNotice } from "./interrupted";

import { useListener } from "~/stt/contexts";

export function BatchState({
  requestedLiveTranscription,
}: {
  requestedLiveTranscription: boolean | null;
}) {
  const amplitude = useListener((state) => state.live.amplitude);

  if (requestedLiveTranscription === true) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <LiveTranscriptInterruptedNotice />
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex h-full min-h-[400px] flex-col items-center justify-center px-6 text-center"
    >
      <div className="text-muted-foreground mb-3">
        <DancingSticks
          amplitude={Math.min(Math.hypot(amplitude.mic, amplitude.speaker), 1)}
          color="currentColor"
          height={16}
          width={28}
          stickWidth={2}
          gap={2}
        />
      </div>
      <div className="flex max-w-[340px] flex-col gap-1">
        <p className="text-title">Batch transcription mode</p>
        <p className="text-muted-foreground text-ui text-balance">
          Recording continues. Your transcript will be generated after you stop.
        </p>
      </div>
    </div>
  );
}
