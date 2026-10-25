import { useAudioPlayer } from "~/audio-player";
import { TranscriptScreenKind } from "~/session/enums";
import {
  BatchSessionMode,
  LiveSessionStatus,
  LiveCaptureUiMode,
} from "~/store/zustand/listener/enums";
import {
  getLiveCaptureUiMode,
  isLiveTranscriptInterrupted,
} from "~/store/zustand/listener/general-shared";
import { useListener } from "~/stt/contexts";
import { ListeningStatus, BatchPhase } from "~/stt/enums";
import type { Segment } from "~/stt/live-segment";
import { useSessionTranscriptMetadata } from "~/stt/queries";

type RequestedLiveTranscription = boolean | null;

export type TranscriptScreen =
  | {
      kind: TranscriptScreenKind.RunningBatch;
      percentage?: number;
      phase?: BatchPhase;
    }
  | {
      kind: TranscriptScreenKind.BatchFallback;
      requestedLiveTranscription: RequestedLiveTranscription;
    }
  | {
      kind: TranscriptScreenKind.Listening;
      status: ListeningStatus;
    }
  | {
      kind: TranscriptScreenKind.Empty;
      hasAudio: boolean;
      error: string | null;
    }
  | {
      kind: TranscriptScreenKind.Ready;
      transcriptIds: string[];
      liveSegments: Segment[];
      currentActive: boolean;
      captureGeneration: number;
      liveTranscriptInterrupted: boolean;
    };

export function useTranscriptScreen({
  sessionId,
}: {
  sessionId: string;
}): TranscriptScreen {
  const {
    batchError,
    batchPercentage,
    batchPhase,
    captureGeneration,
    captureMode,
    liveTranscriptInterrupted,
    requestedLiveTranscription,
    sessionMode,
  } = useListener((state) => ({
    batchError: state.batch[sessionId]?.error ?? null,
    batchPercentage: state.batch[sessionId]?.percentage,
    batchPhase: state.batch[sessionId]?.phase,
    captureGeneration: state.live.captureGenerationBySession[sessionId] ?? 0,
    captureMode: getLiveCaptureUiMode(state.live),
    liveTranscriptInterrupted:
      state.live.sessionId === sessionId &&
      isLiveTranscriptInterrupted(state.live),
    requestedLiveTranscription: state.live.requestedLiveTranscription,
    sessionMode: state.getSessionMode(sessionId),
  }));
  const { audioExists } = useAudioPlayer();
  const currentActive =
    sessionMode === LiveSessionStatus.Active ||
    sessionMode === LiveSessionStatus.Finalizing;
  const { transcriptIds, liveSegments, hasTranscriptWords } =
    useTranscriptContent(sessionId, !currentActive);
  const isRecordOnlyMode =
    sessionMode === LiveSessionStatus.Active &&
    captureMode === LiveCaptureUiMode.RecordOnly;
  const hasVisibleTranscriptState =
    hasTranscriptWords || liveSegments.length > 0 || !!batchError;

  if (sessionMode === BatchSessionMode.RunningBatch) {
    return {
      kind: TranscriptScreenKind.RunningBatch,
      percentage: batchPercentage,
      phase: batchPhase,
    };
  }

  if (
    isRecordOnlyMode ||
    (liveTranscriptInterrupted && currentActive && !hasVisibleTranscriptState)
  ) {
    return {
      kind: TranscriptScreenKind.BatchFallback,
      requestedLiveTranscription,
    };
  }

  if (currentActive && !hasVisibleTranscriptState) {
    return {
      kind: TranscriptScreenKind.Listening,
      status:
        sessionMode === LiveSessionStatus.Finalizing
          ? ListeningStatus.Finalizing
          : ListeningStatus.Listening,
    };
  }

  if (!hasVisibleTranscriptState) {
    return {
      kind: TranscriptScreenKind.Empty,
      hasAudio: audioExists,
      error: batchError,
    };
  }

  return {
    kind: TranscriptScreenKind.Ready,
    transcriptIds,
    liveSegments,
    currentActive,
    captureGeneration,
    liveTranscriptInterrupted,
  };
}

function useTranscriptContent(
  sessionId: string,
  includePendingDeltas: boolean,
) {
  const transcripts = useSessionTranscriptMetadata(
    sessionId,
    includePendingDeltas,
  );
  const liveSegments = useListener((state) => state.liveSegments);

  return {
    transcriptIds: transcripts.map((transcript) => transcript.id),
    liveSegments,
    hasTranscriptWords: transcripts.some((transcript) => transcript.hasWords),
  };
}
