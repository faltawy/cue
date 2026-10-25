import { type RefObject, useCallback } from "react";

import { useRegenerateTranscript } from "./actions";
import { TranscriptViewer } from "./renderer";
import { BatchState } from "./screens/batch";
import { TranscriptEmptyState } from "./screens/empty";
import { LiveTranscriptInterruptedNotice } from "./screens/interrupted";
import { TranscriptListeningState } from "./screens/listening";
import { useTranscriptScreen } from "./state";

import { TranscriptScreenKind } from "~/session/enums";
import { useIncompleteCapture } from "~/stt/capture-result";
import { useListener } from "~/stt/contexts";
import { BatchPhase } from "~/stt/enums";
import { useUploadFile } from "~/stt/useUploadFile";

export function Transcript({
  sessionId,
  scrollRef,
  editMode = false,
  onEditModeChange,
}: {
  sessionId: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  editMode?: boolean;
  onEditModeChange?: (editMode: boolean) => void;
}) {
  return (
    <TranscriptContent
      key={sessionId}
      sessionId={sessionId}
      scrollRef={scrollRef}
      editMode={editMode}
      onEditModeChange={onEditModeChange}
    />
  );
}

function TranscriptContent({
  sessionId,
  scrollRef,
  editMode,
  onEditModeChange,
}: {
  sessionId: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  editMode: boolean;
  onEditModeChange?: (editMode: boolean) => void;
}) {
  const screen = useTranscriptScreen({ sessionId });
  const incompleteCapture = useIncompleteCapture(sessionId);
  const { uploadAudio, uploadTranscript } = useUploadFile(sessionId);
  const regenerateTranscript = useRegenerateTranscript(sessionId);
  const stopTranscription = useListener((state) => state.stopTranscription);
  const handleStopTranscription = useCallback(() => {
    void stopTranscription(sessionId);
  }, [sessionId, stopTranscription]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {incompleteCapture && (
        <div
          role="status"
          className="border-alert-border bg-alert text-foreground text-body border-b px-4 py-2"
        >
          <span className="font-medium">
            {incompleteCapture.audioDeletionFailed
              ? "Audio could not be deleted."
              : "This transcript is incomplete."}
          </span>{" "}
          {incompleteCapture.audioDeletionFailed
            ? "Cue could not remove the temporary audio. Cleanup will be retried automatically."
            : incompleteCapture.audioKeptForTranscription
              ? "Some audio has not been transcribed yet, so Cue kept it temporarily. It will be deleted automatically once transcription succeeds."
              : incompleteCapture.audioDeleted
                ? "Recovery did not finish before the meeting ended. Audio was deleted according to your retention setting."
                : "Some audio could not be transcribed. Available recordings were kept according to your retention setting."}
        </div>
      )}
      {screen.kind === TranscriptScreenKind.RunningBatch && (
        <TranscriptEmptyState
          isBatching
          percentage={screen.percentage}
          phase={screen.phase}
          onStopTranscription={
            screen.phase === BatchPhase.Importing
              ? undefined
              : handleStopTranscription
          }
        />
      )}
      {screen.kind === TranscriptScreenKind.BatchFallback && (
        <BatchState
          requestedLiveTranscription={screen.requestedLiveTranscription}
        />
      )}
      {screen.kind === TranscriptScreenKind.Listening && (
        <TranscriptListeningState status={screen.status} />
      )}
      {screen.kind === TranscriptScreenKind.Empty && (
        <TranscriptEmptyState
          isBatching={false}
          hasAudio={screen.hasAudio}
          error={screen.error}
          onRetranscribe={regenerateTranscript}
          onUploadAudio={uploadAudio}
          onUploadTranscript={uploadTranscript}
        />
      )}
      {screen.kind === TranscriptScreenKind.Ready && (
        <TranscriptViewer
          transcriptIds={screen.transcriptIds}
          liveSegments={screen.liveSegments}
          currentActive={screen.currentActive}
          captureGeneration={screen.captureGeneration}
          scrollRef={scrollRef}
          editMode={editMode && !screen.currentActive}
          onEditModeChange={screen.currentActive ? undefined : onEditModeChange}
          footer={
            screen.liveTranscriptInterrupted ? (
              <LiveTranscriptInterruptedNotice />
            ) : null
          }
        />
      )}
    </div>
  );
}
