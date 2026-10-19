import { t } from "@lingui/core/macro";

import {
  ArrowsClockwise,
  Square,
  WarningCircle,
  Waveform,
} from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";

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
  phase?: "importing" | "transcribing";
  error?: string | null;
  onRetranscribe?: () => void;
  onUploadAudio?: () => void;
  onUploadTranscript?: () => void;
  onStopTranscription?: () => void;
}) {
  if (error) {
    return (
      <div
        role="alert"
        className="flex h-full min-h-[400px] flex-col items-center justify-center px-6 text-center"
      >
        <WarningCircle
          aria-hidden
          className="text-muted-foreground mb-3 size-4"
        />
        <div className="mb-4 flex max-w-[340px] flex-col gap-1">
          <p className="text-title">{t`Transcription failed`}</p>
          <p className="text-muted-foreground text-ui text-balance">{error}</p>
        </div>
        {onRetranscribe && (
          <Button size="sm" onClick={onRetranscribe}>
            <ArrowsClockwise className="size-3.5" />
            {t`Re-transcribe`}
          </Button>
        )}
      </div>
    );
  }

  if (isBatching) {
    const hasProgress = typeof percentage === "number" && percentage > 0;

    return (
      <div
        role="status"
        className="flex h-full min-h-[400px] flex-col items-center justify-center px-6 text-center"
      >
        <div className={onStopTranscription ? "mb-6" : undefined}>
          <p className="text-title coach-sheen">
            {phase === "importing"
              ? t`Importing audio...`
              : t`Generating transcript...`}
          </p>
          {hasProgress && (
            <p className="text-muted-foreground text-ui mt-1 text-balance tabular-nums">
              {t`${Math.round((percentage ?? 0) * 100)}% complete`}
            </p>
          )}
        </div>
        {onStopTranscription && (
          <Button variant="outline" size="sm" onClick={onStopTranscription}>
            <Square className="size-3.5" />
            {t`Stop transcription`}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center px-6 text-center">
      <Waveform aria-hidden className="text-muted-foreground mb-3 size-4" />
      <div className="mb-4 flex max-w-[340px] flex-col gap-1">
        <p className="text-title">
          {hasAudio ? t`Audio available` : t`No transcript available`}
        </p>
        <p className="text-muted-foreground text-ui text-balance">
          {hasAudio
            ? t`Re-transcribe this audio, or upload a transcript file.`
            : t`Upload audio or a transcript file to populate this note.`}
        </p>
      </div>
      {(onRetranscribe || onUploadAudio || onUploadTranscript) && (
        <div className="flex items-center gap-2">
          {hasAudio && onRetranscribe && (
            <Button size="sm" onClick={onRetranscribe}>
              <ArrowsClockwise className="size-3.5" />
              {t`Re-transcribe`}
            </Button>
          )}
          {!hasAudio && onUploadAudio && (
            <Button variant="outline" size="sm" onClick={onUploadAudio}>
              {t`Upload audio`}
            </Button>
          )}
          {onUploadTranscript && (
            <Button variant="outline" size="sm" onClick={onUploadTranscript}>
              {t`Upload transcript`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
