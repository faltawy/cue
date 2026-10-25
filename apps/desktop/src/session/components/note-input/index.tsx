import type { EditorView } from "prosemirror-view";
import {
  forwardRef,
  type MouseEventHandler,
  type UIEventHandler,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";

import type { JSONContent, NoteEditorRef } from "@anlg/editor/note";
import { cn } from "@anlg/utils";
import { SessionNoteViewType } from "@anlg/utils/session";

import { Enhanced } from "./enhanced";
import { Header, SessionViewSwitcher, useEditorTabs } from "./header";
import { RawEditor } from "./raw";
import { SearchBar } from "./search/bar";
import { useSearch } from "./search/context";
import { Transcript } from "./transcript";

import { useCurrentNoteTab } from "~/session/components/shared";
import {
  registerCanonicalSessionEditor,
  unregisterCanonicalSessionEditor,
} from "~/session/editor-activity";
import { TabNavigationDirection } from "~/session/enums";
import { useScrollPreservation } from "~/shared/hooks/useScrollPreservation";
import {
  BatchSessionMode,
  LiveSessionStatus,
} from "~/store/zustand/listener/enums";
import type { SessionMode } from "~/store/zustand/listener/general";
import { type Tab, useTabs } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";
import { type EditorView as TabEditorView } from "~/store/zustand/tabs/schema";
import { useListener } from "~/stt/contexts";
import { SavedCaptureAudioPrompt } from "~/stt/saved-capture-audio";

export interface NoteInputHandle {
  focus: () => void;
  focusAtStart: () => void;
  focusAtPixelWidth: (pixelWidth: number) => void;
  insertAtStartAndFocus: (content: string) => void;
  replaceContent: (content: JSONContent) => void;
  flushPendingChanges: () => void;
  prepareForTabChange: () => void;
}

type NoteInputProps = {
  tab: Extract<Tab, { type: TabType.Sessions }>;
  rawMd: string;
  sessionTitle: string;
  eventTitle?: string;
  eventDescription?: string;
  onNavigateToTitle?: (pixelWidth?: number) => void;
  onScroll?: UIEventHandler<HTMLDivElement>;
  editorTabs?: TabEditorView[];
  currentTab?: TabEditorView;
  handleTabChange?: (view: TabEditorView) => void;
  hideHeader?: boolean;
  sessionMode?: SessionMode;
  transcriptEditMode?: boolean;
  onTranscriptEditModeChange?: (editMode: boolean) => void;
};

export function shouldShowTranscriptTabSpinner(sessionMode: SessionMode) {
  return (
    sessionMode === LiveSessionStatus.Finalizing ||
    sessionMode === BatchSessionMode.RunningBatch
  );
}

export const NoteInput = forwardRef<NoteInputHandle, NoteInputProps>(
  function NoteInput(props, ref) {
    if (
      props.editorTabs &&
      props.currentTab &&
      props.handleTabChange &&
      props.sessionMode !== undefined
    ) {
      return (
        <NoteInputContent
          {...props}
          ref={ref}
          editorTabs={props.editorTabs}
          currentTab={props.currentTab}
          commitTabChange={props.handleTabChange}
          sessionMode={props.sessionMode}
        />
      );
    }

    return <NoteInputWithDerivedState {...props} ref={ref} />;
  },
);

const NoteInputWithDerivedState = forwardRef<NoteInputHandle, NoteInputProps>(
  function NoteInputWithDerivedState(
    { tab, editorTabs, currentTab, handleTabChange, ...props },
    ref,
  ) {
    const fallbackEditorTabs = useEditorTabs({ sessionId: tab.id });
    const fallbackCurrentTab: TabEditorView = useCurrentNoteTab(tab);
    const updateSessionTabState = useTabs(
      (state) => state.updateSessionTabState,
    );
    const tabRef = useRef(tab);
    tabRef.current = tab;
    const sessionMode = useListener((state) => state.getSessionMode(tab.id));

    const commitTabChange = useCallback(
      (tabView: TabEditorView) => {
        if (handleTabChange) {
          handleTabChange(tabView);
          return;
        }

        updateSessionTabState(tabRef.current, {
          ...tabRef.current.state,
          view: tabView,
        });
      },
      [handleTabChange, updateSessionTabState],
    );

    return (
      <NoteInputContent
        {...props}
        ref={ref}
        tab={tab}
        editorTabs={editorTabs ?? fallbackEditorTabs}
        currentTab={currentTab ?? fallbackCurrentTab}
        commitTabChange={commitTabChange}
        sessionMode={props.sessionMode ?? sessionMode}
      />
    );
  },
);

const NoteInputContent = forwardRef<
  NoteInputHandle,
  Omit<NoteInputProps, "editorTabs" | "currentTab" | "handleTabChange"> & {
    editorTabs: TabEditorView[];
    currentTab: TabEditorView;
    commitTabChange: (view: TabEditorView) => void;
    sessionMode: SessionMode;
  }
>(
  (
    {
      tab,
      rawMd,
      sessionTitle,
      eventTitle,
      eventDescription,
      onNavigateToTitle,
      onScroll,
      editorTabs,
      currentTab,
      commitTabChange,
      hideHeader = false,
      sessionMode,
      transcriptEditMode = false,
      onTranscriptEditModeChange,
    },
    ref,
  ) => {
    const internalEditorRef = useRef<NoteEditorRef>(null);
    const sessionId = tab.id;
    const deferredCurrentTab = useDeferredValue(currentTab);
    const renderedCurrentTab = editorTabs.some((editorTab) =>
      isSameEditorView(editorTab, deferredCurrentTab),
    )
      ? deferredCurrentTab
      : currentTab;

    const isMeetingInProgress =
      sessionMode === LiveSessionStatus.Active ||
      sessionMode === LiveSessionStatus.Finalizing ||
      sessionMode === BatchSessionMode.RunningBatch;
    const shouldShowTranscriptSpinner =
      shouldShowTranscriptTabSpinner(sessionMode);

    const { scrollRef, onBeforeTabChange } = useScrollPreservation(
      renderedCurrentTab.type === SessionNoteViewType.Enhanced
        ? `${renderedCurrentTab.type}-${renderedCurrentTab.id}`
        : renderedCurrentTab.type,
    );

    useImperativeHandle(
      ref,
      () => ({
        focus: () => internalEditorRef.current?.commands.focus(),
        focusAtStart: () => internalEditorRef.current?.commands.focusAtStart(),
        focusAtPixelWidth: (px) =>
          internalEditorRef.current?.commands.focusAtPixelWidth(px),
        insertAtStartAndFocus: (content) =>
          internalEditorRef.current?.commands.insertAtStartAndFocus(content),
        replaceContent: (content) =>
          internalEditorRef.current?.commands.replaceContent(content),
        flushPendingChanges: () =>
          internalEditorRef.current?.flushPendingChanges(),
        prepareForTabChange: onBeforeTabChange,
      }),
      [currentTab, onBeforeTabChange],
    );

    const handleTabChange = useCallback(
      (tabView: TabEditorView) => {
        if (
          isSameEditorView(tabView, currentTab) ||
          isSameEditorView(tabView, renderedCurrentTab)
        ) {
          return;
        }

        onBeforeTabChange();
        commitTabChange(tabView);
      },
      [commitTabChange, currentTab, onBeforeTabChange, renderedCurrentTab],
    );

    const handleAdjacentViewShortcut = useCallback(
      (direction: TabNavigationDirection) => {
        if (editorTabs.length <= 1) {
          return;
        }

        const currentIndex = editorTabs.findIndex((editorTab) =>
          isSameEditorView(editorTab, renderedCurrentTab),
        );
        if (currentIndex === -1) {
          return;
        }

        const nextIndex =
          direction === TabNavigationDirection.Previous
            ? (currentIndex - 1 + editorTabs.length) % editorTabs.length
            : (currentIndex + 1) % editorTabs.length;
        const nextView = editorTabs[nextIndex];
        if (nextView) {
          handleTabChange(nextView);
        }
      },
      [editorTabs, handleTabChange, renderedCurrentTab],
    );

    useHotkeys(
      "mod+alt+left",
      () => handleAdjacentViewShortcut(TabNavigationDirection.Previous),
      {
        preventDefault: true,
        enableOnFormTags: true,
        enableOnContentEditable: true,
      },
      [handleAdjacentViewShortcut],
    );

    useHotkeys(
      "mod+alt+right",
      () => handleAdjacentViewShortcut(TabNavigationDirection.Next),
      {
        preventDefault: true,
        enableOnFormTags: true,
        enableOnContentEditable: true,
      },
      [handleAdjacentViewShortcut],
    );

    useEffect(() => {
      if (
        renderedCurrentTab.type === SessionNoteViewType.Raw &&
        isMeetingInProgress
      ) {
        requestAnimationFrame(() => {
          internalEditorRef.current?.commands.focus();
        });
      }
    }, [renderedCurrentTab, isMeetingInProgress]);

    const search = useSearch();
    const showSearchBar = search?.isVisible ?? false;
    const isEditableTab =
      renderedCurrentTab.type === SessionNoteViewType.Enhanced ||
      renderedCurrentTab.type === SessionNoteViewType.Raw;
    const isSearchableTab =
      isEditableTab ||
      renderedCurrentTab.type === SessionNoteViewType.Transcript;

    useEffect(() => {
      search?.close();
    }, [currentTab]);

    const handleContainerMouseDown: MouseEventHandler<HTMLDivElement> = (
      event,
    ) => {
      if (!isEditableTab) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest(".ProseMirror") !== null) {
        return;
      }

      if (
        target.closest(
          "button, a, input, textarea, select, [role='button'], [contenteditable='true']",
        ) !== null
      ) {
        return;
      }

      if (event.currentTarget.querySelector(".ProseMirror") === null) {
        return;
      }

      event.preventDefault();
      internalEditorRef.current?.commands.focusAtTrailingEmptyLine();
    };

    const handleSessionViewReady = useCallback(
      (view: EditorView) =>
        registerCanonicalSessionEditor(sessionId, view, () => {
          const editor = internalEditorRef.current;
          if (!editor || editor.view !== view) {
            throw new Error("Canonical session editor changed");
          }
          editor.flushPendingChanges();
        }),
      [sessionId],
    );
    const handleSessionViewDisposed = useCallback(
      (view: EditorView) => unregisterCanonicalSessionEditor(sessionId, view),
      [sessionId],
    );

    return (
      <div className="-mx-2 flex h-full flex-col">
        <SavedCaptureAudioPrompt sessionId={sessionId} />
        {!hideHeader && (
          <div className="relative px-2">
            <div className="flex items-center justify-between gap-1">
              <SessionViewSwitcher
                sessionId={sessionId}
                editorTabs={editorTabs}
                currentTab={renderedCurrentTab}
                handleTabChange={handleTabChange}
                isTranscribing={shouldShowTranscriptSpinner}
              />
              <Header sessionId={sessionId} />
            </div>
          </div>
        )}

        {showSearchBar && isSearchableTab && (
          <div className="px-3 pt-1">
            <SearchBar
              editorRef={internalEditorRef}
              allowReplace={isEditableTab}
            />
          </div>
        )}

        <div className="relative flex-1 overflow-hidden">
          <div
            ref={scrollRef}
            onMouseDown={handleContainerMouseDown}
            onScroll={onScroll}
            className={cn([
              "h-full px-3",
              "pt-2",
              renderedCurrentTab.type === SessionNoteViewType.Transcript
                ? "overflow-hidden pb-0"
                : "scroll-pb-20 overflow-x-hidden overflow-y-auto pb-24",
            ])}
          >
            {renderedCurrentTab.type === SessionNoteViewType.Enhanced && (
              <Enhanced
                ref={internalEditorRef}
                sessionId={sessionId}
                sessionTitle={sessionTitle}
                enhancedNoteId={renderedCurrentTab.id}
                onNavigateToTitle={onNavigateToTitle}
                onViewReady={handleSessionViewReady}
                onViewDisposed={handleSessionViewDisposed}
              />
            )}
            {renderedCurrentTab.type === SessionNoteViewType.Raw && (
              <RawEditor
                ref={internalEditorRef}
                sessionId={sessionId}
                rawMd={rawMd}
                sessionTitle={sessionTitle}
                eventTitle={eventTitle}
                eventDescription={eventDescription}
                onNavigateToTitle={onNavigateToTitle}
                onViewReady={handleSessionViewReady}
                onViewDisposed={handleSessionViewDisposed}
              />
            )}
            {renderedCurrentTab.type === SessionNoteViewType.Transcript && (
              <Transcript
                sessionId={sessionId}
                scrollRef={scrollRef}
                editMode={transcriptEditMode}
                onEditModeChange={onTranscriptEditModeChange}
              />
            )}
          </div>
        </div>
      </div>
    );
  },
);

function isSameEditorView(left: TabEditorView, right: TabEditorView): boolean {
  if (left.type !== right.type) {
    return false;
  }

  if (
    left.type === SessionNoteViewType.Enhanced &&
    right.type === SessionNoteViewType.Enhanced
  ) {
    return left.id === right.id;
  }

  return true;
}
