import { t } from "@lingui/core/macro";

import { IconWeight, Check } from "@anlg/ui/components/icons";
import { cn } from "@anlg/utils";

import { useTranscriptSelectionState } from "./selection-context";
import { SpeakerAssignPopover } from "./speaker-assign";
import { getSegmentSpeakerColor } from "./utils";

import type { Segment } from "~/stt/live-segment";

export function SegmentHeader({
  segment,
  transcriptId,
  sessionId,
  label,
  selected = false,
  timestampMs,
  audioExists = false,
  onSeek,
}: {
  segment: Segment;
  transcriptId: string;
  sessionId?: string;
  label: string;
  selected?: boolean;
  timestampMs: number;
  audioExists?: boolean;
  onSeek?: () => void;
}) {
  const { selectMode } = useTranscriptSelectionState();
  const headerClassName = cn([
    "relative",
    "text-label",
    "flex items-center gap-2",
  ]);

  return (
    <div className={headerClassName}>
      {selectMode ? (
        <span
          aria-hidden="true"
          className={cn([
            "flex size-4 shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40",
          ])}
        >
          {selected ? (
            <Check className="size-2.5" weight={IconWeight.Bold} />
          ) : null}
        </span>
      ) : null}
      <SpeakerAssignPopover
        segment={segment}
        transcriptId={transcriptId}
        sessionId={sessionId}
        dotColor={getSegmentSpeakerColor(segment.key)}
        label={label}
      />
      {audioExists && onSeek && !selectMode ? (
        <button
          type="button"
          aria-label={t`Seek to ${formatTurnTimestamp(timestampMs)}`}
          onClick={onSeek}
          className="text-muted-foreground hover:text-foreground rounded-sm px-1 tabular-nums"
        >
          {formatTurnTimestamp(timestampMs)}
        </button>
      ) : (
        <time className="text-muted-foreground tabular-nums">
          {formatTurnTimestamp(timestampMs)}
        </time>
      )}
    </div>
  );
}

function formatTurnTimestamp(timestampMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, timestampMs) / 1_000);
  return `${Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0")}:${(totalSeconds % 60).toString().padStart(2, "0")}`;
}
