import "./test-matchers";

import { beforeEach, describe, expect, test, vi } from "vitest";

import { SessionNoteViewType } from "@anlg/utils/session";

import { type Tab, useTabs } from ".";
import {
  createContactsTab,
  createSettingsTab,
  createSessionTab,
  resetTabsStore,
} from "./test-utils";

import { TabType, SettingsTab } from "~/store/zustand/tabs/enums";

const isSessionsTab = (
  tab: Tab,
): tab is Extract<Tab, { type: TabType.Sessions }> =>
  tab.type === TabType.Sessions;

describe("Basic Tab Actions", () => {
  beforeEach(() => {
    resetTabsStore();
  });

  test("openNew builds tab list with last tab active", () => {
    const session1 = createSessionTab({ active: false });
    const session2 = createSessionTab({
      active: false,
      state: { view: { type: SessionNoteViewType.Enhanced, id: "note-1" } },
    });
    const contacts = createContactsTab({ active: false });

    useTabs.getState().openNew(session1);
    useTabs.getState().openNew(session2);
    useTabs.getState().openNew(contacts);

    expect(useTabs.getState()).toHaveCurrentTab({ type: TabType.Contacts });
    expect(useTabs.getState()).toMatchTabsInOrder([
      { id: session1.id, active: false, type: TabType.Sessions },
      { id: session2.id, active: false, type: TabType.Sessions },
      { type: TabType.Contacts, active: true },
    ]);
    expect(useTabs.getState()).toHaveHistoryLength(1);
    expect(useTabs.getState()).toHaveNavigationState({
      canGoBack: false,
      canGoNext: false,
    });
  });

  test("openCurrent switches to existing tab instead of replacing active", () => {
    const session1 = createSessionTab({ active: false });
    const session2 = createSessionTab({ active: false });
    const session3 = createSessionTab({ active: false });
    useTabs.getState().openNew(session1);
    useTabs.getState().openNew(session2);
    useTabs.getState().openNew(session3);

    const duplicateOfSession1 = createSessionTab({
      id: session1.id,
      active: false,
    });
    useTabs.getState().openCurrent(duplicateOfSession1);

    expect(useTabs.getState()).toMatchTabsInOrder([
      { id: session1.id, active: true },
      { id: session2.id, active: false },
      { id: session3.id, active: false },
    ]);
    expect(useTabs.getState()).toHaveHistoryLength(1);
    expect(useTabs.getState()).toHaveNavigationState({
      canGoBack: false,
      canGoNext: false,
    });
  });

  test("openCurrent closes existing active tab via lifecycle handlers", () => {
    const handler = vi.fn();
    const active = createSessionTab({ id: "first", active: false });
    useTabs.getState().registerOnClose(handler);
    useTabs.getState().openCurrent(active);

    const next = createSessionTab({ id: "second", active: false });
    useTabs.getState().openCurrent(next);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: "first" }),
    );
  });

  test("openNew is idempotent - switches to existing tab instead of duplicating", () => {
    const session1 = createSessionTab({ id: "tab1", active: false });
    const session2 = createSessionTab({ id: "tab2", active: false });
    useTabs.getState().openNew(session1);
    useTabs.getState().openNew(session2);

    useTabs.getState().openNew(createSessionTab({ id: "tab1", active: false }));

    const state = useTabs.getState();
    expect(state).toMatchTabsInOrder([
      { id: "tab1", active: true },
      { id: "tab2", active: false },
    ]);
    expect(state).toHaveHistoryLength(1);
  });

  test("openNew applies auto-start when reusing a session tab", () => {
    useTabs.getState().openNew({
      type: "sessions",
      id: "tab1",
      state: {
        view: { type: "enhanced", id: "summary-1" },
        autoStart: null,
      },
    });

    useTabs.getState().openNew({
      type: "sessions",
      id: "tab1",
      state: { view: null, autoStart: true },
    });

    expect(useTabs.getState()).toHaveCurrentTab({
      id: "tab1",
      state: {
        view: { type: SessionNoteViewType.Enhanced, id: "summary-1" },
        autoStart: true,
        scheduledAutoStart: null,
      },
    });
    expect(useTabs.getState().tabs).toHaveLength(1);
  });

  test("openNew reuses contacts tab and updates the selected entity", () => {
    const contacts = createContactsTab({
      active: false,
      state: { selected: { type: "person", id: "ada" } },
    });
    const session = createSessionTab({ id: "tab1", active: false });

    useTabs.getState().openNew(contacts);
    useTabs.getState().openNew(session);
    useTabs.getState().openNew(
      createContactsTab({
        active: false,
        state: { selected: { type: "organization", id: "acme" } },
      }),
    );

    const state = useTabs.getState();
    expect(state).toMatchTabsInOrder([
      {
        type: TabType.Contacts,
        active: true,
        state: { selected: { type: "organization", id: "acme" } },
      },
      { id: "tab1", active: false, type: TabType.Sessions },
    ]);
    expect(state).toHaveCurrentTab({
      type: TabType.Contacts,
      state: { selected: { type: "organization", id: "acme" } },
    });
  });

  test("openNew reuses settings tab and updates requested subsection", () => {
    const settings = createSettingsTab({
      active: false,
      state: { tab: SettingsTab.App },
    });
    const session = createSessionTab({ id: "tab1", active: false });

    useTabs.getState().openNew(settings);
    useTabs.getState().openNew(session);
    useTabs.getState().openNew(
      createSettingsTab({
        active: false,
        state: { tab: SettingsTab.Notifications },
      }),
    );

    const state = useTabs.getState();
    expect(state).toMatchTabsInOrder([
      {
        type: TabType.Settings,
        active: true,
        state: { tab: SettingsTab.Notifications },
      },
      { id: "tab1", active: false, type: TabType.Sessions },
    ]);
    expect(state).toHaveCurrentTab({
      type: TabType.Settings,
      state: { tab: SettingsTab.Notifications },
    });
    expect(state).toHaveLastHistoryEntry({
      type: TabType.Settings,
      state: { tab: SettingsTab.Notifications },
    });
  });

  test("openNew tracks where settings was opened from", () => {
    const session = createSessionTab({ id: "tab1", active: false });

    useTabs.getState().openNew(session);
    const openedSession = useTabs.getState().currentTab!;
    useTabs.getState().openNew({ type: "settings" });

    expect(useTabs.getState()).toHaveCurrentTab({
      type: TabType.Settings,
      returnToSlotId: openedSession.slotId,
      returnToTabId: `sessions-${session.id}`,
    });
  });

  test.each([TabType.Calendar, TabType.Contacts, TabType.Templates] as const)(
    "openNew tracks where %s was opened from",
    (type) => {
      useTabs.getState().openNew({ type: "settings" });
      const settings = useTabs.getState().currentTab!;
      useTabs.getState().openNew({ type });

      expect(useTabs.getState()).toHaveCurrentTab({
        type,
        returnToSlotId: settings.slotId,
        returnToTabId: "settings",
      });
    },
  );

  test("openNew redirects legacy automation settings links to General", () => {
    useTabs.getState().openNew({
      type: "settings",
      state: { tab: "automations" },
    });

    expect(useTabs.getState()).toHaveCurrentTab({
      type: TabType.Settings,
      state: { tab: SettingsTab.App },
    });
  });

  test("openNew redirects legacy folder settings links", () => {
    useTabs.getState().openNew({
      type: "settings",
      state: { tab: "folders" },
    });

    expect(useTabs.getState()).toHaveCurrentTab({ type: TabType.Folders });
  });

  test("openNew refreshes settings return target when reusing its tab", () => {
    const session1 = createSessionTab({ id: "tab1", active: false });
    const session2 = createSessionTab({ id: "tab2", active: false });

    useTabs.getState().openNew(session1);
    useTabs.getState().openNew({ type: "settings" });
    useTabs.getState().openNew(session2);
    const openedSession2 = useTabs.getState().currentTab!;
    useTabs.getState().openNew({
      type: "settings",
      state: { tab: "notifications" },
    });

    expect(useTabs.getState()).toHaveCurrentTab({
      type: TabType.Settings,
      state: { tab: SettingsTab.Notifications },
      returnToSlotId: openedSession2.slotId,
    });
  });

  test("openNew preserves settings return target while settings is already active", () => {
    const session = createSessionTab({ id: "tab1", active: false });

    useTabs.getState().openNew(session);
    const openedSession = useTabs.getState().currentTab!;
    useTabs.getState().openNew({ type: "settings" });
    useTabs.getState().openNew({
      type: "settings",
      state: { tab: "notifications" },
    });

    expect(useTabs.getState()).toHaveCurrentTab({
      type: TabType.Settings,
      state: { tab: SettingsTab.Notifications },
      returnToSlotId: openedSession.slotId,
    });
  });

  test("openNew clears stale settings return target when reused without an origin", () => {
    const session = createSessionTab({ id: "tab1", active: false });

    useTabs.getState().openNew(session);
    useTabs.getState().openNew({ type: "settings" });
    useTabs.getState().clearSelection();
    useTabs.getState().openNew({
      type: "settings",
      state: { tab: "notifications" },
    });

    expect(useTabs.getState()).toHaveCurrentTab({
      type: TabType.Settings,
      state: { tab: SettingsTab.Notifications },
    });
    expect(useTabs.getState().currentTab?.returnToSlotId).toBeUndefined();
  });

  test("openCurrent clears return targets when replacing their origin slot", () => {
    const session1 = createSessionTab({ id: "tab1", active: false });
    const session2 = createSessionTab({ id: "tab2", active: false });

    useTabs.getState().openNew(session1);
    const openedSession = useTabs.getState().currentTab!;
    useTabs.getState().openNew({ type: "settings" });
    useTabs.getState().select(openedSession);
    useTabs.getState().openCurrent(session2);

    const settingsTab = useTabs
      .getState()
      .tabs.find((tab) => tab.type === TabType.Settings);

    expect(settingsTab?.returnToSlotId).toBeUndefined();
  });

  test("close clears return targets for the closed origin slot", () => {
    const session = createSessionTab({ id: "tab1", active: false });

    useTabs.getState().openNew(session);
    const openedSession = useTabs.getState().currentTab!;
    useTabs.getState().openNew({ type: "settings" });
    useTabs.getState().close(openedSession);

    expect(useTabs.getState()).toHaveCurrentTab({ type: TabType.Settings });
    expect(useTabs.getState().currentTab?.returnToSlotId).toBeUndefined();
  });

  test.each([
    [undefined, SettingsTab.App],
    ["lab", SettingsTab.App],
    ["data", SettingsTab.App],
    ["imports", SettingsTab.App],
    ["privacy", SettingsTab.App],
    ["stats", SettingsTab.App],
    ["developers", SettingsTab.App],
    ["insights", SettingsTab.App],
    ["intelligence", SettingsTab.Claude],
    ["personalization", SettingsTab.Dictionary],
    ["audio", SettingsTab.Meetings],
    ["billing", SettingsTab.App],
    ["referrals", SettingsTab.App],
    ["crm", SettingsTab.App],
    ["account", SettingsTab.App],
  ] as const)(
    "openNew normalizes settings tab %s to %s",
    (requested, expected) => {
      useTabs
        .getState()
        .openNew(
          requested === undefined
            ? { type: "settings" }
            : { type: "settings", state: { tab: requested as SettingsTab } },
        );

      expect(useTabs.getState()).toHaveCurrentTab({
        type: TabType.Settings,
        state: { tab: expected },
      });
      expect(useTabs.getState()).toMatchTabsInOrder([
        { type: TabType.Settings, active: true, state: { tab: expected } },
      ]);
    },
  );

  test("select toggles active flag without changing history", () => {
    const tabA = createSessionTab({ active: true });
    const tabB = createSessionTab({ active: false });
    useTabs.getState().openNew(tabA);
    useTabs.getState().openNew(tabB);

    useTabs.getState().select(tabA);

    const state = useTabs.getState();
    if (!state.currentTab || !isSessionsTab(state.currentTab)) {
      throw new Error("expected current tab to be a sessions tab");
    }
    expect(state.currentTab.id).toBe(tabA.id);
    const target = state.tabs.find((t) => isSessionsTab(t) && t.id === tabA.id);
    expect(target?.active).toBe(true);
    expect(useTabs.getState()).toMatchTabsInOrder([
      { id: tabA.id, active: true },
      { id: tabB.id, active: false },
    ]);
    expect(useTabs.getState()).toHaveHistoryLength(1);
  });

  test("clearSelection returns the store to a home-style no-selection state", () => {
    const tabA = createSessionTab({ active: false });
    const tabB = createSessionTab({ active: false });
    useTabs.getState().openNew(tabA);
    useTabs.getState().openNew(tabB);

    useTabs.getState().clearSelection();

    expect(useTabs.getState().currentTab).toBeNull();
    expect(useTabs.getState()).toMatchTabsInOrder([
      { id: tabA.id, active: false },
      { id: tabB.id, active: false },
    ]);
    expect(useTabs.getState()).toHaveNavigationState({
      canGoBack: false,
      canGoNext: false,
    });
  });

  test("close removes tab, picks fallback active, updates history", () => {
    const active = createSessionTab({ active: true });
    const next = createSessionTab({ active: false });
    useTabs.getState().openNew(active);
    useTabs.getState().openNew(next);

    useTabs.getState().close(active);

    expect(useTabs.getState()).toMatchTabsInOrder([
      { id: next.id, active: true },
    ]);
    expect(useTabs.getState()).toHaveCurrentTab({ id: next.id });
    expect(useTabs.getState().history.size).toBe(1);
    expect(useTabs.getState()).toHaveNavigationState({
      canGoBack: false,
      canGoNext: false,
    });
  });

  test("close last tab empties store", () => {
    const only = createSessionTab({ active: true });
    useTabs.getState().openNew(only);

    useTabs.getState().close(only);

    expect(useTabs.getState().tabs).toHaveLength(0);
    expect(useTabs.getState().currentTab).toBeNull();
    expect(useTabs.getState()).toHaveNavigationState({
      canGoBack: false,
      canGoNext: false,
    });
  });

  test("reorder keeps current tab and flags consistent", () => {
    const active = createSessionTab({ active: true });
    const other = createSessionTab({ active: false });
    useTabs.getState().openNew(active);
    useTabs.getState().openNew(other);

    useTabs.getState().reorder([other, { ...active, active: true }]);

    expect(useTabs.getState()).toMatchTabsInOrder([
      { id: other.id, active: false },
      { id: active.id, active: true },
    ]);
    expect(useTabs.getState()).toHaveCurrentTab(active);
    expect(useTabs.getState()).toHaveNavigationState({
      canGoBack: false,
      canGoNext: false,
    });
  });

  test("closeOthers keeps selected tab and notifies closures", () => {
    const session1 = createSessionTab({ active: true });
    const session2 = createSessionTab({ active: false });
    const session3 = createSessionTab({ active: false });
    const handler = vi.fn();

    useTabs.getState().openNew(session1);
    useTabs.getState().openNew(session2);
    useTabs.getState().openNew(session3);
    useTabs.getState().select(session2);
    useTabs.getState().registerOnClose(handler);

    useTabs.getState().closeOthers(session2);

    const state = useTabs.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state).toHaveCurrentTab({ id: session2.id });
    expect(state).toHaveNavigationState({
      canGoBack: false,
      canGoNext: false,
    });
    expect(state.history.size).toBe(1);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: session1.id }),
    );
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: session3.id }),
    );
  });

  test("closeAll clears store state and notifies handlers", () => {
    const first = createSessionTab({ active: true });
    const second = createContactsTab({ active: false });
    const onClose = vi.fn();
    const onEmpty = vi.fn();

    useTabs.getState().openNew(first);
    useTabs.getState().openNew(second);
    useTabs.getState().registerOnClose(onClose);
    useTabs.getState().registerOnEmpty(onEmpty);

    useTabs.getState().closeAll();

    const state = useTabs.getState();
    expect(state.tabs).toHaveLength(0);
    expect(state.currentTab).toBeNull();
    expect(state.history.size).toBe(0);
    expect(state).toHaveNavigationState({
      canGoBack: false,
      canGoNext: false,
    });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({ id: first.id }),
    );
    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({ type: "contacts" }),
    );
    expect(onEmpty).toHaveBeenCalledTimes(1);
  });
});
