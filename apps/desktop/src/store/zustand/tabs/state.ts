import type { StoreApi } from "zustand";

import type { BasicState } from "./basic";
import { type NavigationState, updateHistoryCurrent } from "./navigation";
import { isSameTab, type Tab } from "./schema";

import { TabType } from "~/store/zustand/tabs/enums";

export type StateBasicActions = {
  updateContactsTabState: (
    tab: Tab,
    state: Extract<Tab, { type: TabType.Contacts }>["state"],
  ) => void;
  updateSessionTabState: (
    tab: Tab,
    state: Extract<Tab, { type: TabType.Sessions }>["state"],
  ) => void;
  updateTemplatesTabState: (
    tab: Tab,
    state: Extract<Tab, { type: TabType.Templates }>["state"],
  ) => void;
  updateSettingsTabState: (
    tab: Tab,
    state: Extract<Tab, { type: TabType.Settings }>["state"],
  ) => void;
  updateDailySummaryTabState: (
    tab: Tab,
    state: Extract<Tab, { type: TabType.DailySummary }>["state"],
  ) => void;
};

export const createStateUpdaterSlice = <T extends BasicState & NavigationState>(
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
): StateBasicActions => ({
  updateSessionTabState: (tab, state) =>
    updateTabState(tab, TabType.Sessions, state, get, set),
  updateContactsTabState: (tab, state) =>
    updateTabState(tab, TabType.Contacts, state, get, set),
  updateTemplatesTabState: (tab, state) =>
    updateTabState(tab, TabType.Templates, state, get, set),
  updateSettingsTabState: (tab, state) =>
    updateTabState(tab, TabType.Settings, state, get, set),
  updateDailySummaryTabState: (tab, state) =>
    updateTabState(tab, TabType.DailySummary, state, get, set),
});

const updateTabState = <T extends BasicState & NavigationState>(
  tab: Tab,
  tabType: Tab["type"],
  newState: any,
  get: StoreApi<T>["getState"],
  set: StoreApi<T>["setState"],
) => {
  const { tabs, currentTab, history } = get();

  const nextTabs = tabs.map((t) =>
    isSameTab(t, tab) && t.type === tabType ? { ...t, state: newState } : t,
  );

  const nextCurrentTab =
    currentTab && isSameTab(currentTab, tab) && currentTab.type === tabType
      ? { ...currentTab, state: newState }
      : currentTab;

  const updatedTab =
    nextTabs.find((t) => isSameTab(t, tab) && t.type === tabType) ?? null;

  const nextHistory = updatedTab
    ? updateHistoryCurrent(history, updatedTab)
    : history;

  set({
    tabs: nextTabs,
    currentTab: nextCurrentTab,
    history: nextHistory,
  } as Partial<T>);
};
