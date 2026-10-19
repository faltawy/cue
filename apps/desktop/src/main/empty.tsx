import { Trans } from "@lingui/react/macro";
import { useCallback } from "react";

import { Kbd, KbdGroup } from "@anlg/ui/components/ui/kbd";
import { cn } from "@anlg/utils";

import { StandardContentWrapper } from "~/shared/main";
import { useNewNote, useNewNoteAndListen } from "~/shared/useNewNote";
import { type Tab, useTabs } from "~/store/zustand/tabs";

export function TabContentEmpty({
  tab: _tab,
}: {
  tab: Extract<Tab, { type: "empty" }>;
}) {
  return (
    <StandardContentWrapper>
      <EmptyView />
    </StandardContentWrapper>
  );
}

function EmptyView() {
  const newNote = useNewNote({ behavior: "current" });
  const newNoteAndListen = useNewNoteAndListen({ behavior: "current" });
  const openCurrent = useTabs((state) => state.openCurrent);

  const openSettings = useCallback(
    () => openCurrent({ type: "settings" }),
    [openCurrent],
  );

  return (
    <div
      data-tauri-drag-region
      className="flex h-full flex-col items-center justify-center gap-6"
    >
      <div className="flex min-w-[280px] flex-col gap-1 text-center">
        <ActionItem
          label={<Trans>New Note</Trans>}
          shortcut={["⌘", "N"]}
          onClick={newNote}
        />
        <ActionItem
          label={<Trans>Start Recording</Trans>}
          shortcut={["⌘", "⇧", "N"]}
          onClick={newNoteAndListen}
        />
        <div className="bg-border mx-3 my-1 h-px" />
        <ActionItem
          label={<Trans>Settings</Trans>}
          shortcut={["⌘", ","]}
          onClick={openSettings}
        />
      </div>
    </div>
  );
}

function ActionItem({
  label,
  shortcut,
  icon,
  onClick,
}: {
  label: React.ReactNode;
  shortcut?: string[];
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-tauri-drag-region="false"
      className={cn([
        "group",
        "flex items-center justify-between gap-8",
        "text-foreground text-sm",
        "rounded-md px-3 py-2",
        "hover:bg-accent focus-visible:bg-accent cursor-pointer transition-colors motion-reduce:transition-none",
      ])}
    >
      <span>{label}</span>
      {shortcut && shortcut.length > 0 ? (
        <KbdGroup aria-hidden>
          {shortcut.map((key) => (
            <Kbd key={key} className="shadow-none">
              {key}
            </Kbd>
          ))}
        </KbdGroup>
      ) : (
        icon
      )}
    </button>
  );
}
