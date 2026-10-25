import { create as mutate } from "mutative";
import type { StoreApi } from "zustand";

import type {
  LiveTranscriptDelta,
  LiveTranscriptSegment,
  LiveTranscriptSegmentDelta,
} from "@anlg/plugin-transcription";

import { TranscriptWriteMode } from "~/stt/enums";
import type { RuntimeSpeakerHint, WordLike } from "~/stt/segment";

type WordsByChannel = Record<number, LiveTranscriptDelta["partials"][number][]>;
// The database retains the complete transcript; UI/native previews only need recent context.
export const LIVE_TRANSCRIPT_PREVIEW_SEGMENT_LIMIT = 200;

export type BatchPersistCallback = (
  words: WordLike[],
  hints: RuntimeSpeakerHint[],
  options?: { mode?: TranscriptWriteMode },
) => void;

export type LiveTranscriptPersistCallback = (
  delta: LiveTranscriptDelta,
) => void;

export type OnStoppedCallback = (
  sessionId: string,
  details: {
    durationSeconds: number;
    stoppedAtMs?: number;
    chunkedAudio?: boolean;
    audioDeletionFailed?: boolean;
    audioPath: string | null;
    requestedLiveTranscription: boolean;
    liveTranscriptionActive: boolean;
    needsBatchRepair: boolean;
  },
) => void | Promise<void>;

export type TranscriptState = {
  liveSegments: LiveTranscriptSegment[];
  partialWordsByChannel: WordsByChannel;
  partialHintsByChannel: Record<number, RuntimeSpeakerHint[]>;
  handlePersistBySession: Record<string, LiveTranscriptPersistCallback>;
  onStoppedBySession: Record<string, OnStoppedCallback>;
};

export type TranscriptActions = {
  setTranscriptPersist: (
    sessionId: string,
    callback?: LiveTranscriptPersistCallback,
  ) => void;
  setOnStopped: (sessionId: string, callback?: OnStoppedCallback) => void;
  handleTranscriptDelta: (
    sessionId: string,
    delta: LiveTranscriptDelta,
    options?: { updateLivePreview?: boolean },
  ) => void;
  handleTranscriptSegmentDelta: (delta: LiveTranscriptSegmentDelta) => void;
  takeOnStopped: (sessionId: string) => OnStoppedCallback | undefined;
  resetTranscript: () => void;
};

const initialState: TranscriptState = {
  liveSegments: [],
  partialWordsByChannel: {},
  partialHintsByChannel: {},
  handlePersistBySession: {},
  onStoppedBySession: {},
};

export const createTranscriptSlice = <
  T extends TranscriptState & TranscriptActions,
>(
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
): TranscriptState & TranscriptActions => ({
  ...initialState,
  setTranscriptPersist: (sessionId, callback) => {
    set((state) =>
      mutate(state, (draft) => {
        if (callback) {
          draft.handlePersistBySession[sessionId] = callback;
        } else {
          delete draft.handlePersistBySession[sessionId];
        }
      }),
    );
  },
  setOnStopped: (sessionId, callback) => {
    set((state) =>
      mutate(state, (draft) => {
        if (callback) {
          draft.onStoppedBySession[sessionId] = callback;
        } else {
          delete draft.onStoppedBySession[sessionId];
        }
      }),
    );
  },
  handleTranscriptDelta: (sessionId, delta, options) => {
    const state = get();
    const handlePersist = state.handlePersistBySession[sessionId];
    const { wordsByChannel, hintsByChannel } = groupPartialsByChannel(
      delta.partials,
    );
    const previewChanged =
      delta.new_words.length > 0 ||
      delta.replaced_ids.length > 0 ||
      !partialWordsByChannelEqual(state.partialWordsByChannel, wordsByChannel);

    if (options?.updateLivePreview !== false && previewChanged) {
      set((state) =>
        mutate(state, (draft) => {
          draft.partialWordsByChannel = wordsByChannel;
          draft.partialHintsByChannel = hintsByChannel;
        }),
      );
    }

    if (delta.new_words.length === 0 && delta.replaced_ids.length === 0) {
      return;
    }

    handlePersist?.(delta);
  },
  handleTranscriptSegmentDelta: (delta) => {
    if (delta.upserts.length === 0 && delta.removed_ids.length === 0) {
      return;
    }
    set((state) =>
      mutate(state, (draft) => {
        draft.liveSegments = applyLiveSegmentDelta(draft.liveSegments, delta);
      }),
    );
  },
  takeOnStopped: (sessionId) => {
    const callback = get().onStoppedBySession[sessionId];
    set((state) =>
      mutate(state, (draft) => {
        delete draft.onStoppedBySession[sessionId];
        delete draft.handlePersistBySession[sessionId];
      }),
    );
    return callback;
  },
  resetTranscript: () => {
    set((state) =>
      mutate(state, (draft) => {
        draft.liveSegments = [];
        draft.partialWordsByChannel = {};
        draft.partialHintsByChannel = {};
      }),
    );
  },
});

function groupPartialsByChannel(partials: LiveTranscriptDelta["partials"]): {
  wordsByChannel: WordsByChannel;
  hintsByChannel: Record<number, RuntimeSpeakerHint[]>;
} {
  const wordsByChannel: WordsByChannel = {};
  const hintsByChannel: Record<number, RuntimeSpeakerHint[]> = {};

  partials.forEach((word) => {
    const channel = word.channel;
    const channelWords = wordsByChannel[channel] ?? [];
    if (!(channel in wordsByChannel)) {
      wordsByChannel[channel] = channelWords;
      hintsByChannel[channel] = [];
    }

    const channelIndex = channelWords.length;
    channelWords.push(word);

    if (word.speaker_index != null) {
      hintsByChannel[channel]!.push({
        wordIndex: channelIndex,
        data: {
          type: "provider_speaker_index",
          speaker_index: word.speaker_index,
          channel,
        },
      });
    }
  });

  return { wordsByChannel, hintsByChannel };
}

function partialWordsByChannelEqual(
  left: WordsByChannel,
  right: WordsByChannel,
): boolean {
  const leftChannels = Object.keys(left);
  const rightChannels = Object.keys(right);
  if (leftChannels.length !== rightChannels.length) {
    return false;
  }

  return leftChannels.every((channelKey) => {
    const channel = Number(channelKey);
    const leftWords = left[channel] ?? [];
    const rightWords = right[channel] ?? [];
    return (
      leftWords.length === rightWords.length &&
      leftWords.every((word, index) => {
        const other = rightWords[index];
        return (
          other !== undefined &&
          word.text === other.text &&
          word.start_ms === other.start_ms &&
          word.end_ms === other.end_ms &&
          word.channel === other.channel &&
          word.speaker_index === other.speaker_index
        );
      })
    );
  });
}

function applyLiveSegmentDelta(
  segments: LiveTranscriptSegment[],
  delta: LiveTranscriptSegmentDelta,
): LiveTranscriptSegment[] {
  const changedIds = new Set([
    ...delta.removed_ids,
    ...delta.upserts.map((segment) => segment.id),
  ]);
  const nextSegments = segments.filter(
    (segment) => !changedIds.has(segment.id),
  );
  nextSegments.push(...delta.upserts);
  nextSegments.sort(
    (a, b) =>
      a.start_ms - b.start_ms ||
      a.end_ms - b.end_ms ||
      a.id.localeCompare(b.id),
  );
  return nextSegments.slice(-LIVE_TRANSCRIPT_PREVIEW_SEGMENT_LIMIT);
}
