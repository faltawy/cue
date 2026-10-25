import { type Tab, useTabs } from ".";
import { computeHistoryFlags } from "./navigation";

import { id } from "~/shared/utils";
import {
  TabType,
  SettingsTab as SettingsTabValue,
} from "~/store/zustand/tabs/enums";

type SessionTab = Extract<Tab, { type: TabType.Sessions }>;
type ContactsTab = Extract<Tab, { type: TabType.Contacts }>;
type SettingsTab = Extract<Tab, { type: TabType.Settings }>;

type SessionOverrides = Partial<Omit<SessionTab, "type" | "state">> & {
  state?: Partial<SessionTab["state"]>;
};

type ContactsOverrides = Partial<Omit<ContactsTab, "type" | "state">> & {
  state?: Partial<ContactsTab["state"]>;
};

type SettingsOverrides = Partial<Omit<SettingsTab, "type" | "state">> & {
  state?: Partial<SettingsTab["state"]>;
};

export const createSessionTab = (
  overrides: SessionOverrides = {},
): SessionTab => ({
  type: TabType.Sessions,
  id: overrides.id ?? id(),
  active: overrides.active ?? false,
  pinned: overrides.pinned ?? false,
  slotId: id(),
  state: {
    view: null,
    autoStart: null,
    scheduledAutoStart: null,
    ...overrides.state,
  },
});

export const createContactsTab = (
  overrides: ContactsOverrides = {},
): ContactsTab => ({
  type: TabType.Contacts,
  active: overrides.active ?? false,
  pinned: overrides.pinned ?? false,
  slotId: id(),
  state: {
    selected: null,
    ...overrides.state,
  },
});

export const createSettingsTab = (
  overrides: SettingsOverrides = {},
): SettingsTab => ({
  type: TabType.Settings,
  active: overrides.active ?? false,
  pinned: overrides.pinned ?? false,
  slotId: overrides.slotId ?? id(),
  state: {
    tab: SettingsTabValue.App,
    ...overrides.state,
  },
});

type TabsStore = ReturnType<typeof useTabs.getState>;
type TabsStateSlice = Pick<
  TabsStore,
  | "currentTab"
  | "tabs"
  | "history"
  | "canGoBack"
  | "canGoNext"
  | "onClose"
  | "onEmpty"
  | "closedTabs"
>;

const createDefaultTabsState = (): TabsStateSlice => ({
  currentTab: null,
  tabs: [],
  history: new Map(),
  canGoBack: false,
  canGoNext: false,
  onClose: null,
  onEmpty: null,
  closedTabs: [],
});

export const seedTabsStore = (
  overrides: Partial<TabsStateSlice> = {},
): void => {
  const state = { ...createDefaultTabsState(), ...overrides };
  useTabs.setState(() => state);
  const flags = computeHistoryFlags(state.history, state.currentTab);
  useTabs.setState(() => flags);
};

export const resetTabsStore = (): void => {
  seedTabsStore();
};
