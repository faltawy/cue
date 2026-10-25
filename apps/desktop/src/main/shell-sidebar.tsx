import { type ReactNode } from "react";

import { useShell } from "~/contexts/shell";
import { LeftSidebar } from "~/sidebar";
import { useTabs } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";

export function ClassicMainSidebar({
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
  const { leftsidebar } = useShell();
  const currentTab = useTabs((state) => state.currentTab);
  const isOnboarding = currentTab?.type === TabType.Onboarding;

  if (!leftsidebar.expanded || isOnboarding) {
    return null;
  }

  return (
    <LeftSidebar
      folderFilter={folderFilter}
      timelineHeader={timelineHeader}
      showIgnoredTimelineEvents={showIgnoredTimelineEvents}
      onShowIgnoredTimelineEventsChange={onShowIgnoredTimelineEventsChange}
    />
  );
}
