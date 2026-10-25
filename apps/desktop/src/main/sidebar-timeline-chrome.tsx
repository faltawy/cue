import { memo, type ReactNode } from "react";

import {
  MagnifyingGlass,
  NotePencil,
  Sidebar,
  SidebarSimple,
} from "@anlg/ui/components/icons";
import { cn } from "@anlg/utils";

import type { ShortcutKey } from "~/shared/shortcut-keys";
import { ShortcutHint } from "~/shared/ui/shortcut-hint";
import { SidebarBadge } from "~/sidebar/enums";
import { SidebarNoteFilterMenu } from "~/sidebar/note-filter-menu";
import { useSidebarUpcomingMeetingStatus } from "~/sidebar/timeline/upcoming-meeting";

export const SidebarTimelineChromeWithUpcomingMeeting = memo(
  function SidebarTimelineChromeWithUpcomingMeeting({
    currentSessionId,
    onNewNote,
    onSearch,
    onToggleSidebar,
    sidebarExpanded,
    showIgnoredTimelineEvents,
  }: {
    currentSessionId?: string;
    onNewNote: () => void;
    onSearch: () => void;
    onToggleSidebar: () => void;
    sidebarExpanded: boolean;
    showIgnoredTimelineEvents: boolean;
  }) {
    const upcomingMeetingStatus = useSidebarUpcomingMeetingStatus({
      showIgnored: showIgnoredTimelineEvents,
    });
    const hasUpcomingMeeting = upcomingMeetingStatus
      ? !currentSessionId ||
        upcomingMeetingStatus.itemKey !== `session-${currentSessionId}`
      : false;

    return (
      <SidebarTimelineChrome
        hasUpcomingMeeting={hasUpcomingMeeting}
        onNewNote={onNewNote}
        onSearch={onSearch}
        onToggleSidebar={onToggleSidebar}
        sidebarExpanded={sidebarExpanded}
      />
    );
  },
);

function SidebarTimelineChrome({
  hasUpcomingMeeting,
  onNewNote,
  onSearch,
  onToggleSidebar,
  sidebarExpanded,
}: {
  hasUpcomingMeeting: boolean;
  onNewNote: () => void;
  onSearch: () => void;
  onToggleSidebar: () => void;
  sidebarExpanded: boolean;
}) {
  const collapsedBadge = !sidebarExpanded
    ? hasUpcomingMeeting
      ? SidebarBadge.UpcomingMeeting
      : null
    : null;

  return (
    <div data-tauri-drag-region className="flex w-full items-center">
      <div data-tauri-drag-region className="flex items-center gap-0">
        <LeftSurfaceChromeButton
          ariaLabel={sidebarExpanded ? "Hide sidebar" : "Show sidebar"}
          shortcut={["mod", "\\"]}
          badge={collapsedBadge}
          onClick={onToggleSidebar}
        >
          {sidebarExpanded ? (
            <SidebarSimple size={16} />
          ) : (
            <Sidebar size={16} />
          )}
        </LeftSurfaceChromeButton>
        {sidebarExpanded ? (
          <SidebarNoteActions onNewNote={onNewNote} onSearch={onSearch} />
        ) : null}
      </div>
    </div>
  );
}

export function SidebarNoteActions({
  onNewNote,
  onSearch,
}: {
  onNewNote: () => void;
  onSearch: () => void;
}) {
  return (
    <>
      <LeftSurfaceChromeButton
        ariaLabel="Search"
        shortcut={["mod", "K"]}
        onClick={onSearch}
      >
        <MagnifyingGlass size={15} />
      </LeftSurfaceChromeButton>
      <LeftSurfaceChromeButton
        ariaLabel="New note"
        shortcut={["mod", "N"]}
        onClick={onNewNote}
      >
        <NotePencil size={15} />
      </LeftSurfaceChromeButton>
      <SidebarNoteFilterMenu />
    </>
  );
}

export function LeftSurfaceChromeButton({
  ariaLabel,
  shortcut,
  badge = null,
  children,
  disabled = false,
  onClick,
}: {
  ariaLabel: string;
  shortcut?: readonly ShortcutKey[];
  badge?: SidebarBadge | null;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <ShortcutHint label={ariaLabel} keys={shortcut}>
      <button
        type="button"
        aria-label={ariaLabel}
        data-tauri-drag-region="false"
        disabled={disabled}
        className={cn([
          "pointer-events-auto relative flex size-7 items-center justify-center rounded-md",
          "text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent/70 transition-colors",
          "disabled:text-muted-foreground/70 disabled:hover:text-muted-foreground/70 disabled:hover:bg-transparent",
        ])}
        onClick={onClick}
      >
        {children}
        {badge ? (
          <span
            aria-hidden="true"
            data-testid="collapsed-sidebar-upcoming-meeting-badge"
            className="ring-background bg-warm pointer-events-none absolute end-1 top-1 size-1.5 rounded-full ring-2"
          />
        ) : null}
      </button>
    </ShortcutHint>
  );
}
