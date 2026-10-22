import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentTab: { type: "empty" } as { type: string } | null,
  leftSidebarExpanded: true,
  setLeftSidebarExpanded: vi.fn(),
  windowExpandWidth: vi.fn(() => Promise.resolve({ status: "ok", data: null })),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
}));

vi.mock("@anlg/plugin-windows", () => ({
  commands: {
    windowExpandWidth: mocks.windowExpandWidth,
  },
}));

vi.mock("~/contexts/shell", () => ({
  useShell: () => ({
    leftsidebar: {
      expanded: mocks.leftSidebarExpanded,
      setExpanded: mocks.setLeftSidebarExpanded,
    },
  }),
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (
    selector: (state: { currentTab: typeof mocks.currentTab }) => unknown,
  ) => selector({ currentTab: mocks.currentTab }),
}));

import { MainBodyPanels } from "./body-panels";

import { ZOOM_STORAGE_KEY } from "~/shared/zoom";

let restorePanelWidths: (() => void) | null = null;

describe("MainBodyPanels", () => {
  beforeEach(() => {
    cleanup();
    restorePanelWidths?.();
    restorePanelWidths = null;
    mocks.currentTab = { type: "empty" };
    mocks.leftSidebarExpanded = true;
    mocks.setLeftSidebarExpanded.mockClear();
    mocks.windowExpandWidth.mockClear();
    window.localStorage.removeItem(ZOOM_STORAGE_KEY);
  });

  it.each([
    ["settings", "settings", {}, "min(900px, 100%)"],
    ["sessions", "sessions", {}, "700px"],
    ["empty", "empty", {}, "700px"],
    [
      "standalone sessions",
      "sessions",
      { leftSidebarAvailable: false, noteSurfaceMinWidth: 420 },
      "420px",
    ],
  ] as const)(
    "reserves the main-body min width for the %s surface",
    (_label, tabType, props, expectedMinWidth) => {
      mocks.currentTab = { type: tabType };

      render(renderPanels(null, props, <div data-testid="main-content" />));

      expect(
        screen
          .getByTestId("main-content")
          .closest<HTMLElement>("[data-main-body-panel-container]")
          ?.parentElement?.style.minWidth,
      ).toBe(expectedMinWidth);
    },
  );

  it.each([
    {
      name: "the left sidebar",
      leftSidebarExpanded: true,
      widths: { bodyPanelWidth: 640, leftSidebarWidth: 200 },
      sidebarAttr: "data-left-sidebar-chrome",
      tabType: "sessions",
      expectedArgs: [60, null, false, true, false],
    },
    {
      name: "the left sidebar at a zoomed scale",
      leftSidebarExpanded: true,
      zoom: "3",
      widths: { bodyPanelWidth: 640, leftSidebarWidth: 200 },
      sidebarAttr: "data-left-sidebar-chrome",
      tabType: "sessions",
      expectedArgs: [180, null, false, true, false],
    },
    {
      name: "the expanded sidebar panel without sidebar chrome",
      leftSidebarExpanded: true,
      widths: { bodyPanelWidth: 720, leftSidebarWidth: 276 },
      sidebarAttr: "data-left-sidebar-panel-content",
      tabType: "sessions",
      expectedArgs: [56, null, false, true, false],
    },
  ] as const)(
    "expands the window for $name",
    ({
      leftSidebarExpanded,
      zoom,
      widths,
      sidebarAttr,
      tabType,
      expectedArgs,
    }) => {
      mocks.currentTab = { type: tabType };
      mocks.leftSidebarExpanded = leftSidebarExpanded;
      if (zoom) {
        window.localStorage.setItem(ZOOM_STORAGE_KEY, zoom);
      }
      mockPanelWidths(widths);

      render(renderPanels(sidebarAttr));

      expect(mocks.windowExpandWidth).toHaveBeenCalledWith(...expectedArgs);
      expect(mocks.setLeftSidebarExpanded).not.toHaveBeenCalled();
    },
  );

  it("collapses the left sidebar when a window resize would make the note surface narrower than 500px", () => {
    mocks.currentTab = { type: "sessions" };
    mocks.leftSidebarExpanded = true;
    const panelWidths = {
      bodyPanelWidth: 720,
      leftSidebarWidth: 200,
    };
    mockPanelWidths(panelWidths);

    render(renderPanels("data-left-sidebar-chrome"));

    expect(mocks.setLeftSidebarExpanded).not.toHaveBeenCalled();

    panelWidths.bodyPanelWidth = 690;
    fireEvent.resize(window);

    expect(mocks.setLeftSidebarExpanded).toHaveBeenCalledWith(false);
  });
});

function renderPanels(
  sidebarAttr:
    | "data-left-sidebar-chrome"
    | "data-left-sidebar-panel-content"
    | null,
  props: {
    leftSidebarAvailable?: boolean;
    noteSurfaceMinWidth?: number;
  } = {},
  children: React.ReactNode = (
    <div data-chat-floating-anchor>
      <div data-session-surface />
    </div>
  ),
) {
  return (
    <MainBodyPanels {...props}>
      {sidebarAttr ? <div {...{ [sidebarAttr]: "" }} /> : null}
      {children}
    </MainBodyPanels>
  );
}

function mockPanelWidths(widths: {
  bodyPanelWidth: number;
  leftSidebarWidth: number;
  panelGroupWidth?: number;
}) {
  restorePanelWidths?.();
  const spy = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function getBoundingClientRectMock(this: HTMLElement) {
      if (this.hasAttribute("data-main-body-panel-container")) {
        return rectWithWidth(widths.bodyPanelWidth);
      }

      if (this.hasAttribute("data-main-body-panel-group")) {
        return rectWithWidth(widths.panelGroupWidth ?? 0);
      }

      if (
        this.hasAttribute("data-left-sidebar-chrome") ||
        this.hasAttribute("data-left-sidebar-panel-content")
      ) {
        return rectWithWidth(widths.leftSidebarWidth);
      }

      return rectWithWidth(0);
    });
  restorePanelWidths = () => spy.mockRestore();
}

function rectWithWidth(width: number) {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
}
