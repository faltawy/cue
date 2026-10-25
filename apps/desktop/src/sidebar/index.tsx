import { type ReactNode } from "react";

import { cn } from "@anlg/utils";

import { CalendarNav } from "./calendar";
import { ContactsNav } from "./contacts";
import { FolderMaterialsPanel } from "./folder-materials";
import { SidebarFolderNav } from "./folder-nav";
import { FoldersNav } from "./folders";
import { SettingsNav } from "./settings";
import { SidebarTagNav } from "./tag-nav";
import { TemplatesNav } from "./templates";
import { TimelineView } from "./timeline";
import { hasOwnSidebarHeaderTab } from "./use-custom-sidebar";

import { useTabs } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";

export function LeftSidebar({
  folderFilter = null,
  timelineHeader,
  showIgnoredTimelineEvents,
  onShowIgnoredTimelineEventsChange,
}: {
  folderFilter?: string | null;
  timelineHeader?: ReactNode;
  showIgnoredTimelineEvents?: boolean;
  onShowIgnoredTimelineEventsChange?: (showIgnored: boolean) => void;
} = {}) {
  const currentTab = useTabs((state) => state.currentTab);

  const isSettingsMode = currentTab?.type === TabType.Settings;
  const isCalendarMode = currentTab?.type === TabType.Calendar;
  const isContactsMode = currentTab?.type === TabType.Contacts;
  const isTemplatesMode = currentTab?.type === TabType.Templates;
  const isFoldersMode = currentTab?.type === TabType.Folders;
  const isSpecialMode =
    isSettingsMode ||
    isCalendarMode ||
    isContactsMode ||
    isTemplatesMode ||
    isFoldersMode;
  const isTimelineSidebarLayout = !isSpecialMode;
  // Navs with their own CustomSidebarHeader fill the chrome row themselves; a
  // top padding here would push the header out of it (and overflow-hidden
  // would clip a pulled-up header).
  const needsChromeRowGutter =
    isSpecialMode && !hasOwnSidebarHeaderTab(currentTab);
  return (
    <div
      className={cn([
        "flex h-full w-full shrink-0 flex-col gap-1 overflow-hidden",
        needsChromeRowGutter ? "pt-11" : "pt-0",
        !isTimelineSidebarLayout && "pe-1",
      ])}
    >
      <div className="flex flex-1 flex-col gap-1 overflow-hidden">
        {isTimelineSidebarLayout ? timelineHeader : null}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {isSettingsMode ? (
            <SettingsNav />
          ) : isCalendarMode ? (
            <CalendarNav />
          ) : isContactsMode ? (
            <ContactsNav />
          ) : isTemplatesMode ? (
            <TemplatesNav />
          ) : isFoldersMode ? (
            <FoldersNav />
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <SidebarFolderNav />
              <SidebarTagNav />
              {folderFilter ? (
                <FolderMaterialsPanel folderPath={folderFilter} />
              ) : null}
              <div className="relative min-h-0 flex-1">
                <TimelineView
                  folderFilter={folderFilter}
                  showIgnoredEvents={showIgnoredTimelineEvents}
                  onShowIgnoredEventsChange={onShowIgnoredTimelineEventsChange}
                  topChromeInset={isTimelineSidebarLayout && !timelineHeader}
                  topChipsOverlapHeader={
                    isTimelineSidebarLayout && !!timelineHeader
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
