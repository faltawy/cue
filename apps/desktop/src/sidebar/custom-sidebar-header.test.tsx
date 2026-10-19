import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canGoBack: false,
  currentTab: { type: "settings" } as {
    returnToSlotId?: string;
    returnToTabId?: string;
    slotId?: string;
    type: string;
  } | null,
  goBack: vi.fn(),
  openCurrent: vi.fn(),
  select: vi.fn(),
  tabs: [] as {
    returnToSlotId?: string;
    returnToTabId?: string;
    slotId?: string;
    type: string;
  }[],
}));

vi.mock("~/store/zustand/tabs", () => {
  const getState = () => ({
    canGoBack: mocks.canGoBack,
    currentTab: mocks.currentTab,
    goBack: mocks.goBack,
    openCurrent: mocks.openCurrent,
    select: mocks.select,
    tabs: mocks.tabs,
  });
  const useTabs = Object.assign(
    (selector: (state: unknown) => unknown) => selector(getState()),
    { getState },
  );

  return {
    uniqueIdfromTab: (tab: { type: string }) => tab.type,
    useTabs,
  };
});

import { CustomSidebarHeader } from "./custom-sidebar-header";

describe("CustomSidebarHeader", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.canGoBack = false;
    mocks.currentTab = { type: "settings" };
    mocks.goBack.mockClear();
    mocks.openCurrent.mockClear();
    mocks.select.mockClear();
    mocks.tabs = [];
  });

  it("opens home from the back button", () => {
    render(<CustomSidebarHeader />);

    fireEvent.click(screen.getByRole("button", { name: "Go home" }));

    expect(mocks.openCurrent).toHaveBeenCalledWith({ type: "empty" });
  });

  it("selects an existing home tab from the back button", () => {
    const homeTab = { type: "empty" };
    mocks.tabs = [homeTab];

    render(<CustomSidebarHeader />);

    fireEvent.click(screen.getByRole("button", { name: "Go home" }));

    expect(mocks.select).toHaveBeenCalledWith(homeTab);
    expect(mocks.openCurrent).not.toHaveBeenCalled();
  });

  it("returns a workspace opened from settings back to settings", () => {
    const settingsTab = { slotId: "slot-settings", type: "settings" };
    mocks.currentTab = {
      returnToSlotId: "slot-settings",
      returnToTabId: "settings",
      slotId: "slot-folders",
      type: "folders",
    };
    mocks.tabs = [settingsTab, mocks.currentTab, { type: "empty" }];

    render(<CustomSidebarHeader />);

    fireEvent.click(screen.getByRole("button", { name: "Go home" }));

    expect(mocks.select).toHaveBeenCalledWith(settingsTab);
    expect(mocks.openCurrent).not.toHaveBeenCalled();
  });

  it("opens home directly from Automations", () => {
    mocks.currentTab = { type: "automations" };

    render(<CustomSidebarHeader />);

    fireEvent.click(screen.getByRole("button", { name: "Go home" }));

    expect(mocks.openCurrent).toHaveBeenCalledWith({ type: "empty" });
  });
});
