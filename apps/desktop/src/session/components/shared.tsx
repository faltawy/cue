import { useMemo } from "react";

import {
  SessionNoteViewType,
  computeCurrentNoteTab,
} from "@anlg/utils/session";

import { extractPlainText } from "~/search/contexts/engine/utils";
import { useEnhancedNotes } from "~/session/hooks/useEnhancedNotes";
import {
  useEnhancedNote,
  useSession,
  useSessionHasTranscript,
} from "~/session/queries";
import {
  BatchSessionMode,
  LiveSessionStatus,
} from "~/store/zustand/listener/enums";
import type { SessionMode } from "~/store/zustand/listener/general";
import { TabType } from "~/store/zustand/tabs/enums";
import { type Tab, type EditorView } from "~/store/zustand/tabs/schema";
import { useListener } from "~/stt/contexts";

export function useHasTranscript(sessionId: string): boolean {
  return useSessionHasTranscript(sessionId);
}

export function hasStoredNoteContent(value: unknown): boolean {
  return extractPlainText(value).trim().length > 0;
}

export function useCurrentNoteHasContent(
  sessionId: string,
  currentView: EditorView,
): boolean {
  const hasTranscript = useHasTranscript(sessionId);
  const rawMd = useSession(sessionId)?.raw_md;
  const enhancedNoteId =
    currentView.type === SessionNoteViewType.Enhanced ? currentView.id : "";
  const enhancedContent = useEnhancedNote(enhancedNoteId)?.content;

  if (currentView.type === SessionNoteViewType.Enhanced) {
    return hasStoredNoteContent(enhancedContent);
  }

  if (currentView.type === SessionNoteViewType.Transcript) {
    return hasTranscript;
  }

  return hasStoredNoteContent(rawMd);
}

export function useCurrentNoteTab(
  tab: Extract<Tab, { type: TabType.Sessions }>,
  { audioExists = false }: { audioExists?: boolean } = {},
): EditorView {
  const sessionMode = useListener((state) => state.getSessionMode(tab.id));
  const isLiveSessionActive = sessionMode === LiveSessionStatus.Active;
  const canShowTranscript = useCanShowTranscript(tab.id, { audioExists });

  const hasTranscript = useHasTranscript(tab.id);
  const enhancedNoteIds = useEnhancedNotes(
    tab.id,
    hasTranscript && sessionMode === LiveSessionStatus.Inactive,
  );

  return useMemo(() => {
    return computeCurrentNoteTab(
      tab.state.view ?? null,
      isLiveSessionActive,
      enhancedNoteIds,
      canShowTranscript,
    );
  }, [tab.state.view, isLiveSessionActive, enhancedNoteIds, canShowTranscript]);
}

export function useCanShowTranscript(
  sessionId: string,
  { audioExists = false }: { audioExists?: boolean } = {},
): boolean {
  const hasTranscript = useHasTranscript(sessionId);
  const sessionMode = useListener((state) => state.getSessionMode(sessionId));
  const batchError = useListener((state) => state.batch[sessionId]?.error);
  const hasLiveSegments = useListener(
    (state) =>
      state.live.sessionId === sessionId && state.liveSegments.length > 0,
  );

  return getCanShowTranscript({
    audioExists,
    batchError: Boolean(batchError),
    hasLiveSegments,
    hasTranscript,
    sessionMode,
  });
}

export function getCanShowTranscript({
  audioExists = false,
  batchError = false,
  hasLiveSegments = false,
  hasTranscript,
  sessionMode,
}: {
  audioExists?: boolean;
  batchError?: boolean;
  hasLiveSegments?: boolean;
  hasTranscript: boolean;
  sessionMode: SessionMode;
}): boolean {
  const isLiveCapture =
    sessionMode === LiveSessionStatus.Active ||
    sessionMode === LiveSessionStatus.Finalizing;

  return (
    hasTranscript ||
    (audioExists && !isLiveCapture) ||
    isLiveCapture ||
    hasLiveSegments ||
    sessionMode === BatchSessionMode.RunningBatch ||
    Boolean(batchError)
  );
}

export function RecordingIcon() {
  return (
    <span className="flex size-3 items-center justify-center">
      <span className="bg-live coach-live-dot size-2 rounded-full" />
    </span>
  );
}
