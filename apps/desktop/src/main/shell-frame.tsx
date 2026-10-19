import { memo } from "react";

import { ClassicMainBody } from "./body";
import { resolveMainSurfaceChrome } from "./main-surface-chrome";

import { useShell } from "~/contexts/shell";
import { DevtoolsStatusBar } from "~/devtools-bar";
import { MainShellBodyFrame, MainShellScaffold } from "~/shared/main";
import { ToastNotifications } from "~/sidebar/toast";
import {
  hasCustomSidebarTab,
  hasLeftSurfaceCustomSidebarTab,
  useCustomSidebarEffect,
} from "~/sidebar/use-custom-sidebar";
import { useTabs } from "~/store/zustand/tabs";

export function ClassicMainShellFrame() {
  const { leftsidebar } = useShell();
  const currentTab = useTabs((state) => state.currentTab);

  const isOnboarding = currentTab?.type === "onboarding";
  const isChangelog = currentTab?.type === "changelog";
  const hasCustomSidebar = hasCustomSidebarTab(currentTab);
  useCustomSidebarEffect(hasCustomSidebar, leftsidebar);

  const hasLeftSurfaceCustomSidebar =
    hasLeftSurfaceCustomSidebarTab(currentTab);
  const showSidebarTimelineChrome = !hasCustomSidebar && !isOnboarding;
  const showSidebarTimeline = showSidebarTimelineChrome && leftsidebar.expanded;
  const mainSurfaceChrome = resolveMainSurfaceChrome({
    hasLeftSurfaceCustomSidebar,
    isChangelog,
    leftSidebarExpanded: leftsidebar.expanded,
    showSidebarTimeline,
    showSidebarTimelineChrome,
  });

  const shell = (
    <MainShellScaffold
      edgeToEdge={isOnboarding}
      mainSurfaceChrome={isOnboarding ? undefined : mainSurfaceChrome}
    >
      <ClassicMainBodyHost />
      <ToastNotifications />
    </MainShellScaffold>
  );

  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">{shell}</div>
      <DevtoolsStatusBar />
    </div>
  );
}

const ClassicMainBodyHost = memo(function ClassicMainBodyHost() {
  return (
    <MainShellBodyFrame>
      <ClassicMainBody />
    </MainShellBodyFrame>
  );
});
