import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useLayoutEffect, useRef } from "react";

import { commands as windowsCommands } from "@anlg/plugin-windows";

import {
  AUTOMATIONS_SURFACE_MIN_WIDTH_PX,
  boundedMinWidthPx,
  NOTE_SURFACE_MIN_WIDTH_PX,
  SETTINGS_SURFACE_MIN_WIDTH_PX,
  usesNoteSurfaceMinWidth,
} from "./layout-widths";

import { useShell } from "~/contexts/shell";
import { readZoomFactor } from "~/shared/zoom";
import { type Tab, useTabs } from "~/store/zustand/tabs";

const LEFT_SIDEBAR_MIN_WIDTH_PX = 200;

export function MainBodyPanels({
  children,
  leftSidebarAvailable = true,
  noteSurfaceMinWidth = NOTE_SURFACE_MIN_WIDTH_PX,
}: {
  children: React.ReactNode;
  leftSidebarAvailable?: boolean;
  noteSurfaceMinWidth?: number;
}) {
  const { leftsidebar } = useShell();
  const currentTab = useTabs((state) => state.currentTab);
  const bodyPanelContainerRef = useRef<HTMLDivElement>(null);
  const leftSidebarExpanded = leftSidebarAvailable && leftsidebar.expanded;
  const reserveNoteSurfaceMinWidth = usesNoteSurfaceMinWidth(currentTab);
  const collapseLeftSidebar = useCallback(() => {
    leftsidebar.setExpanded(false);
  }, [leftsidebar.setExpanded]);
  const bodyMinWidthPx = getMainBodyMinWidth({
    currentTab,
    leftSidebarExpanded,
    noteSurfaceMinWidth,
  });
  const bodyMinWidth =
    currentTab?.type === "settings" && bodyMinWidthPx != null
      ? boundedMinWidthPx(bodyMinWidthPx)
      : bodyMinWidthPx;

  useNoteSurfaceWindowWidthGuard({
    bodyPanelContainerRef,
    enabled: reserveNoteSurfaceMinWidth,
    leftPanelOpen: leftSidebarExpanded,
    collapseLeftPanel: collapseLeftSidebar,
    noteSurfaceMinWidth,
  });

  return (
    <div
      data-main-body-panel-group
      className="flex min-h-0 flex-1 overflow-hidden"
    >
      <div
        className="min-h-0 min-w-0 flex-1 overflow-hidden"
        style={{ minWidth: bodyMinWidth }}
      >
        <div
          ref={bodyPanelContainerRef}
          data-main-body-panel-container
          className="h-full min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function getMainBodyMinWidth({
  currentTab,
  leftSidebarExpanded,
  noteSurfaceMinWidth,
}: {
  currentTab: Tab | null;
  leftSidebarExpanded: boolean;
  noteSurfaceMinWidth: number;
}) {
  if (currentTab?.type === "automations") {
    return (
      AUTOMATIONS_SURFACE_MIN_WIDTH_PX +
      (leftSidebarExpanded ? LEFT_SIDEBAR_MIN_WIDTH_PX : 0)
    );
  }

  if (currentTab?.type === "settings") {
    return (
      SETTINGS_SURFACE_MIN_WIDTH_PX +
      (leftSidebarExpanded ? LEFT_SIDEBAR_MIN_WIDTH_PX : 0)
    );
  }

  if (!usesNoteSurfaceMinWidth(currentTab)) {
    return undefined;
  }

  return (
    noteSurfaceMinWidth + (leftSidebarExpanded ? LEFT_SIDEBAR_MIN_WIDTH_PX : 0)
  );
}

function useNoteSurfaceWindowWidthGuard({
  bodyPanelContainerRef,
  collapseLeftPanel,
  enabled,
  leftPanelOpen,
  noteSurfaceMinWidth,
}: {
  bodyPanelContainerRef: React.RefObject<HTMLDivElement | null>;
  collapseLeftPanel: () => void;
  enabled: boolean;
  leftPanelOpen: boolean;
  noteSurfaceMinWidth: number;
}) {
  const lastVisibleBodyWidthRef = useRef<number | null>(null);
  const previousStateRef = useRef({ enabled: false, leftPanelOpen: false });

  useLayoutEffect(() => {
    const previousState = previousStateRef.current;
    previousStateRef.current = { enabled, leftPanelOpen };

    const leftPanelJustOpened =
      enabled &&
      leftPanelOpen &&
      (!previousState.enabled || !previousState.leftPanelOpen);
    if (!leftPanelJustOpened) {
      return;
    }

    const bodyPanel = bodyPanelContainerRef.current;
    if (!bodyPanel || !isTauri()) {
      return;
    }

    const bodyWidth = getVisibleBodyWidth(bodyPanel);
    if (bodyWidth <= 0) {
      return;
    }

    const requiredBodyWidth =
      noteSurfaceMinWidth + getLeftSidebarWidth(bodyPanel, leftPanelOpen);
    const widthDeficit = Math.ceil(requiredBodyWidth - bodyWidth);
    if (widthDeficit <= 0) {
      return;
    }

    void windowsCommands.windowExpandWidth(
      Math.ceil(widthDeficit * readZoomFactor()),
      null,
      false,
      true,
      false,
    );
  }, [bodyPanelContainerRef, enabled, leftPanelOpen, noteSurfaceMinWidth]);

  useLayoutEffect(() => {
    lastVisibleBodyWidthRef.current = null;

    if (!enabled || !leftPanelOpen) {
      return;
    }

    const bodyPanel = bodyPanelContainerRef.current;
    if (!bodyPanel) {
      return;
    }

    const handleResize = () => {
      collapseLeftPanelIfNoteSurfaceWouldShrink({
        bodyPanel,
        collapseLeftPanel,
        lastVisibleBodyWidthRef,
        noteSurfaceMinWidth,
      });
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(handleResize)
        : null;
    resizeObserver?.observe(bodyPanel);

    const shell = bodyPanel.closest<HTMLElement>(
      "[data-testid='main-app-shell']",
    );
    if (shell) {
      resizeObserver?.observe(shell);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
    };
  }, [
    bodyPanelContainerRef,
    collapseLeftPanel,
    enabled,
    leftPanelOpen,
    noteSurfaceMinWidth,
  ]);
}

function collapseLeftPanelIfNoteSurfaceWouldShrink({
  bodyPanel,
  collapseLeftPanel,
  lastVisibleBodyWidthRef,
  noteSurfaceMinWidth,
}: {
  bodyPanel: HTMLElement;
  collapseLeftPanel: () => void;
  lastVisibleBodyWidthRef: React.MutableRefObject<number | null>;
  noteSurfaceMinWidth: number;
}) {
  const visibleBodyWidth = getVisibleBodyWidth(bodyPanel);
  if (visibleBodyWidth <= 0) {
    return;
  }

  const lastVisibleBodyWidth = lastVisibleBodyWidthRef.current;
  lastVisibleBodyWidthRef.current = visibleBodyWidth;

  if (
    lastVisibleBodyWidth === null ||
    visibleBodyWidth >= lastVisibleBodyWidth
  ) {
    return;
  }

  const leftSidebarWidth = getLeftSidebarWidth(bodyPanel, true);
  const noteSurfaceWidth = visibleBodyWidth - leftSidebarWidth;

  if (noteSurfaceWidth < noteSurfaceMinWidth) {
    collapseLeftPanel();
  }
}

function getVisibleBodyWidth(bodyPanel: HTMLElement) {
  const bodyWidth = bodyPanel.getBoundingClientRect().width;
  const widthContainer =
    bodyPanel.closest<HTMLElement>("[data-main-body-panel-group]") ??
    bodyPanel.closest<HTMLElement>("[data-testid='main-app-shell']");
  if (!widthContainer) {
    return bodyWidth;
  }

  const containerWidth = widthContainer.getBoundingClientRect().width;
  if (containerWidth <= 0) {
    return bodyWidth;
  }

  if (bodyWidth <= 0) {
    return containerWidth;
  }

  return Math.min(bodyWidth, containerWidth);
}

function getLeftSidebarWidth(bodyPanel: HTMLElement, leftPanelOpen: boolean) {
  if (!leftPanelOpen) {
    return 0;
  }

  const leftSidebar = bodyPanel.querySelector<HTMLElement>(
    "[data-left-sidebar-chrome], [data-left-sidebar-panel-content]",
  );
  const measuredWidth = leftSidebar?.getBoundingClientRect().width ?? 0;

  return measuredWidth > 0 ? measuredWidth : LEFT_SIDEBAR_MIN_WIDTH_PX;
}
