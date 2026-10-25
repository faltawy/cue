import { cn } from "@anlg/utils";

import { setSessionFabSelectionHost } from "./selection-slot";

import { TabType } from "~/store/zustand/tabs/enums";
import type { EditorView, Tab } from "~/store/zustand/tabs/schema";

export function FloatingActionButton(_props: {
  allowListening?: boolean;
  audioExists?: boolean;
  currentView: EditorView;
  skipReason?: string | null;
  tab: Extract<Tab, { type: TabType.Sessions }>;
}) {
  return (
    <div
      className={cn([
        "pointer-events-none absolute bottom-3 left-1/2 z-30 flex w-[min(640px,calc(100cqw_-_2rem))] max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col-reverse items-center",
      ])}
    >
      <div
        ref={setSessionFabSelectionHost}
        data-session-fab-selection
        className={cn(["pointer-events-auto z-10 mb-2"])}
      />
    </div>
  );
}
