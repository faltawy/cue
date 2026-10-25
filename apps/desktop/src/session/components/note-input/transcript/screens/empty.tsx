import { t } from "@lingui/core/macro";

import { ArrowsClockwise, Square } from "@anlg/ui/components/icons";
import { Chip } from "@anlg/ui/components/ui/chip";

import { EmptyState } from "~/shared/ui/empty-state";
import { BatchPhase } from "~/stt/enums";

export function TranscriptEmptyState({
  isBatching,
  hasAudio,
  percentage,
  phase,
  error,
  onRetranscribe,
  onUploadAudio,
  onUploadTranscript,
  onStopTranscription,
}: {
  isBatching?: boolean;
  hasAudio?: boolean;
  percentage?: number;
  phase?: BatchPhase;
  error?: string | null;
  onRetranscribe?: () => void;
  onUploadAudio?: () => void;
  onUploadTranscript?: () => void;
  onStopTranscription?: () => void;
}) {
  if (error) {
    return (
      <div role="alert" className="flex flex-1 items-center px-4">
        <EmptyState
          title={t`Transcription failed`}
          description={error}
          action={
            onRetranscribe
              ? { label: t`Re-transcribe`, onClick: onRetranscribe }
              : undefined
          }
        />
      </div>
    );
  }

  if (isBatching) {
    const hasProgress = typeof percentage === "number" && percentage > 0;

    return (
      <div role="status" className="flex flex-1 items-center px-4">
        <EmptyState
          title={
            <span className="coach-sheen">
              {phase === BatchPhase.Importing
                ? t`Importing audio...`
                : t`Generating transcript...`}
            </span>
          }
          description={
            hasProgress ? (
              <span className="tabular-nums">{t`${Math.round((percentage ?? 0) * 100)}% complete`}</span>
            ) : phase === BatchPhase.Importing ? (
              t`Adding the recording to this note.`
            ) : (
              t`Your transcript will appear here when it's ready.`
            )
          }
        >
          {onStopTranscription && (
            <Chip onClick={onStopTranscription}>
              <Square className="size-3" />
              {t`Stop transcription`}
            </Chip>
          )}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center px-4">
      <EmptyState
        title={hasAudio ? t`Audio available` : t`No transcript yet`}
        description={
          hasAudio
            ? t`Re-transcribe this audio, or upload a transcript file.`
            : t`Upload a recording, or bring in a transcript you already have.`
        }
      >
        {(onRetranscribe || onUploadAudio || onUploadTranscript) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {hasAudio && onRetranscribe && (
              <Chip onClick={onRetranscribe}>
                <ArrowsClockwise className="size-3" />
                {t`Re-transcribe`}
              </Chip>
            )}
            {!hasAudio && onUploadAudio && (
              <Chip onClick={onUploadAudio}>{t`Upload audio`}</Chip>
            )}
            {onUploadTranscript && (
              <Chip onClick={onUploadTranscript}>{t`Upload transcript`}</Chip>
            )}
          </div>
        )}
      </EmptyState>
    </div>
  );
}
