import { MainSurfaceChrome } from "~/shared/enums";

export function resolveMainSurfaceChrome({
  hasLeftSurfaceCustomSidebar,
  isChangelog,
  leftSidebarExpanded,
  showSidebarTimeline,
  showSidebarTimelineChrome,
}: {
  hasLeftSurfaceCustomSidebar: boolean;
  isChangelog: boolean;
  leftSidebarExpanded: boolean;
  showSidebarTimeline: boolean;
  showSidebarTimelineChrome: boolean;
}): MainSurfaceChrome {
  if (showSidebarTimelineChrome && !leftSidebarExpanded) {
    return MainSurfaceChrome.TopBorderless;
  }

  if (isChangelog && !showSidebarTimeline) {
    return MainSurfaceChrome.Top;
  }

  if (showSidebarTimeline || hasLeftSurfaceCustomSidebar) {
    return MainSurfaceChrome.Left;
  }

  return MainSurfaceChrome.Default;
}
