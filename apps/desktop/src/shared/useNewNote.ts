import { useCallback } from "react";
import { useShallow } from "zustand/shallow";

import { createSession } from "~/session/queries";
import { addSessionTag } from "~/session/tags";
import { useSidebarNotes } from "~/sidebar/note-filter";
import { listenerStore } from "~/store/zustand/listener/instance";
import { useTabs } from "~/store/zustand/tabs";

async function createNoteSession() {
  const { folderFilter, tagFilter } = useSidebarNotes.getState();
  const sessionId = await (folderFilter === null
    ? createSession()
    : createSession("", undefined, { folder_id: folderFilter }));
  if (tagFilter !== null) {
    await addSessionTag(sessionId, tagFilter).catch((error: unknown) => {
      console.error("[session] failed to tag new note", error);
    });
  }
  return sessionId;
}

export function useNewNote({
  behavior = "new",
}: {
  behavior?: "new" | "current";
} = {}) {
  const { openNew, openCurrent } = useTabs(
    useShallow((state) => ({
      openNew: state.openNew,
      openCurrent: state.openCurrent,
    })),
  );

  const handler = useCallback(() => {
    const ff = behavior === "new" ? openNew : openCurrent;
    void createNoteSession()
      .then((sessionId) => {
        ff({ type: "sessions", id: sessionId });
      })
      .catch((error) => {
        console.error("[session] failed to create note", error);
      });
  }, [openNew, openCurrent, behavior]);

  return handler;
}

export function useNewNoteAndListen({
  behavior = "new",
}: {
  behavior?: "new" | "current";
} = {}) {
  const handler = useCallback(
    () => openNewNoteAndListen({ behavior }),
    [behavior],
  );

  return handler;
}

export function openNewNoteAndListen({
  behavior = "new",
}: {
  behavior?: "new" | "current";
} = {}) {
  const { status, sessionId: liveSessionId } = listenerStore.getState().live;

  if (status === "active" && liveSessionId) {
    const { openNew, openCurrent } = useTabs.getState();
    const open = behavior === "new" ? openNew : openCurrent;
    open({ type: "sessions", id: liveSessionId });
    return;
  }

  void createNoteSession()
    .then((sessionId) => {
      openSessionAndListen(sessionId, { behavior });
    })
    .catch((error) => {
      console.error("[session] failed to create listening note", error);
    });
}

export function openSessionAndListen(
  sessionId: string,
  {
    behavior = "new",
  }: {
    behavior?: "new" | "current";
  } = {},
) {
  const { openNew, openCurrent } = useTabs.getState();
  const { status } = listenerStore.getState().live;
  const open = behavior === "new" ? openNew : openCurrent;

  if (status === "active") {
    open({ type: "sessions", id: sessionId });
    return;
  }

  open({
    type: "sessions",
    id: sessionId,
    state: { view: null, autoStart: true, scheduledAutoStart: null },
  });
}
