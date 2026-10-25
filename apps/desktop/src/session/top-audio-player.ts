import { SessionNoteViewType } from "@anlg/utils/session";

import type { EditorView } from "~/store/zustand/tabs/schema";

export function shouldShowSessionTopAudioPlayer({
  audioExists,
  audioUrlReady,
  currentView,
  sessionMode,
}: {
  audioExists: boolean;
  audioUrlReady: boolean;
  currentView: EditorView;
  sessionMode: string;
}) {
  return (
    currentView.type === SessionNoteViewType.Transcript &&
    audioExists &&
    audioUrlReady &&
    sessionMode !== "active" &&
    sessionMode !== "finalizing"
  );
}
