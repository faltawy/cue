import { useLingui } from "@lingui/react/macro";

import { segmentedTrackClassName } from "@anlg/ui/components/ui/segmented";
import { cn } from "@anlg/utils";
import { SessionNoteViewType, createEditorTabs } from "@anlg/utils/session";

import { LiveSessionStatus } from "~/store/zustand/listener/enums";

export { createEditorTabs } from "@anlg/utils/session";

import { HeaderViewEnhanced } from "./header-enhanced";
import { HeaderViewRaw } from "./header-raw";
import { HeaderViewTranscript } from "./header-transcript";

import { FolderPicker } from "~/session/components/folder-picker";
import {
  useCanShowTranscript,
  useHasTranscript,
} from "~/session/components/shared";
import { useEnhancedNotes } from "~/session/hooks/useEnhancedNotes";
import { deleteEnhancedNote } from "~/session/queries";
import { type EditorView } from "~/store/zustand/tabs/schema";
import { useListener } from "~/stt/contexts";

export function Header({ sessionId }: { sessionId: string }) {
  return <FolderPicker sessionId={sessionId} align="end" />;
}

export function SessionViewSwitcher({
  sessionId,
  editorTabs,
  currentTab,
  handleTabChange,
  isTranscribing = false,
  transcriptEditMode = false,
  onTranscriptEditModeChange,
}: {
  sessionId: string;
  editorTabs: EditorView[];
  currentTab: EditorView;
  handleTabChange: (view: EditorView) => void;
  isTranscribing?: boolean;
  transcriptEditMode?: boolean;
  onTranscriptEditModeChange?: (editMode: boolean) => void;
}) {
  const { t } = useLingui();
  const primaryEnhancedTabId = editorTabs.find(
    (
      view,
    ): view is Extract<EditorView, { type: SessionNoteViewType.Enhanced }> =>
      view.type === SessionNoteViewType.Enhanced,
  )?.id;
  const shouldUseViewSwitcher = editorTabs.length > 1;

  if (!shouldUseViewSwitcher) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label={t`Session note views`}
      data-tauri-drag-region="false"
      className={cn([
        "pointer-events-auto relative z-10 w-fit max-w-full shrink-0 overflow-visible",
        segmentedTrackClassName,
      ])}
    >
      {editorTabs.map((view, index) => {
        if (view.type === SessionNoteViewType.Enhanced) {
          return (
            <HeaderViewEnhanced
              key={`enhanced-${view.id}`}
              sessionId={sessionId}
              enhancedNoteId={view.id}
              canRemove={view.id !== primaryEnhancedTabId}
              onRemove={
                view.id !== primaryEnhancedTabId
                  ? () => {
                      const previousView = editorTabs[index - 1];
                      if (
                        currentTab.type === SessionNoteViewType.Enhanced &&
                        currentTab.id === view.id &&
                        previousView
                      ) {
                        handleTabChange(previousView);
                      }

                      void deleteEnhancedNote(view.id).catch((error) => {
                        console.error(
                          "[session-header] failed to remove summary",
                          error,
                        );
                      });
                    }
                  : undefined
              }
              onSelectNote={(enhancedNoteId) =>
                handleTabChange({
                  type: SessionNoteViewType.Enhanced,
                  id: enhancedNoteId,
                })
              }
              isActive={
                currentTab.type === SessionNoteViewType.Enhanced &&
                currentTab.id === view.id
              }
              onClick={() => handleTabChange(view)}
            />
          );
        }

        if (view.type === SessionNoteViewType.Raw) {
          return (
            <HeaderViewRaw
              key={view.type}
              sessionId={sessionId}
              isActive={currentTab.type === view.type}
              standalone={!shouldUseViewSwitcher}
              onClick={() => handleTabChange(view)}
            />
          );
        }

        if (view.type === SessionNoteViewType.Transcript) {
          return (
            <HeaderViewTranscript
              key={view.type}
              sessionId={sessionId}
              isActive={currentTab.type === view.type}
              isTranscribing={isTranscribing}
              editMode={transcriptEditMode}
              onEditModeChange={onTranscriptEditModeChange}
              onClick={() => handleTabChange(view)}
            />
          );
        }

        return null;
      })}
    </div>
  );
}

export function useEditorTabs({
  audioExists = false,
  sessionId,
}: {
  audioExists?: boolean;
  sessionId: string;
}): EditorView[] {
  const canShowTranscript = useCanShowTranscript(sessionId, { audioExists });
  const hasTranscript = useHasTranscript(sessionId);
  const sessionMode = useListener((state) => state.getSessionMode(sessionId));
  const enhancedNoteIds = useEnhancedNotes(
    sessionId,
    hasTranscript && sessionMode === LiveSessionStatus.Inactive,
  );

  return createEditorTabs({
    enhancedNoteIds,
    canShowTranscript,
  });
}
