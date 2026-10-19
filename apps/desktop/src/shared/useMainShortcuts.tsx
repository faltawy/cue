import { useHotkeys } from "react-hotkeys-hook";

import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";

import { leaveOverlayTab } from "~/shared/leave-overlay-tab";
import { useNewNote, useNewNoteAndListen } from "~/shared/useNewNote";
import { useTabs } from "~/store/zustand/tabs";

export function useMainShortcuts() {
  const currentTab = useTabs((state) => state.currentTab);

  const newNote = useNewNote();
  const newNoteCurrent = useNewNote({ behavior: "current" });

  useMountEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      const escapeContext = getEscapeShortcutContext(event.target);

      window.setTimeout(() => {
        if (shouldSkipEscapeShortcut(event, escapeContext)) {
          return;
        }

        leaveOverlayTab();
      });
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  });

  useHotkeys(
    "mod+n",
    () => {
      if (currentTab?.type === "empty") {
        newNoteCurrent();
      } else {
        newNote();
      }
    },
    {
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
    [currentTab, newNote, newNoteCurrent],
  );

  const newNoteAndListen = useNewNoteAndListen();

  useHotkeys(
    "mod+shift+n",
    () => newNoteAndListen(),
    {
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
    [newNoteAndListen],
  );

  return { runEscapeShortcut: leaveOverlayTab };
}

export function getEscapeShortcutContext(target: EventTarget | null) {
  const fromProseMirrorEditor = isFromProseMirrorEditor(target);

  return {
    fromProseMirrorEditor,
    fromSessionTitleInput: isFromSessionTitleInput(target),
    fromSessionSurface: isFromSessionSurface(target),
    fromTranscriptEditor:
      target instanceof Element &&
      target.closest("[data-transcript-editor]") !== null,
    hadEditorEscapeConsumer:
      fromProseMirrorEditor &&
      document.querySelector("[data-editor-escape-consumer]") !== null,
    hadMeaningfulFocus: hasMeaningfulFocus(target),
  };
}

export function shouldSkipEscapeShortcut(
  event: KeyboardEvent,
  {
    fromProseMirrorEditor,
    fromSessionTitleInput,
    fromSessionSurface,
    fromTranscriptEditor,
    hadEditorEscapeConsumer,
    hadMeaningfulFocus,
  }: {
    fromProseMirrorEditor: boolean;
    fromSessionTitleInput: boolean;
    fromSessionSurface: boolean;
    fromTranscriptEditor: boolean;
    hadEditorEscapeConsumer: boolean;
    hadMeaningfulFocus: boolean;
  },
) {
  if (!event.defaultPrevented) {
    return false;
  }

  if (!hadMeaningfulFocus) {
    return false;
  }

  if (fromTranscriptEditor) {
    return true;
  }

  if (fromSessionTitleInput || fromSessionSurface) {
    return false;
  }

  if (!fromProseMirrorEditor) {
    return true;
  }

  return hadEditorEscapeConsumer;
}

function hasMeaningfulFocus(target: EventTarget | null) {
  if (isMeaningfulEscapeTarget(target)) {
    return true;
  }

  const activeElement = document.activeElement;

  return (
    activeElement instanceof HTMLElement &&
    activeElement !== document.body &&
    activeElement !== document.documentElement
  );
}

function isMeaningfulEscapeTarget(target: EventTarget | null) {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;

  return (
    element !== null &&
    element !== document.body &&
    element !== document.documentElement
  );
}

function isFromProseMirrorEditor(target: EventTarget | null) {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;

  return element !== null && element.closest(".ProseMirror") !== null;
}

function isFromSessionTitleInput(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("[data-session-title-input]") !== null
  );
}

function isFromSessionSurface(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("[data-session-surface]") !== null
  );
}
