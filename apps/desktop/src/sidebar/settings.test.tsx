import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentTab: { type: "settings", state: { tab: "app" } } as {
    type: "settings";
    state: { tab?: string };
  } | null,
  tabs: [] as Array<{
    active: boolean;
    pinned: boolean;
    slotId: string;
    type: "templates";
    state: {
      showHomepage: boolean;
      isWebMode: boolean;
      selectedMineId: string | null;
      selectedWebIndex: number | null;
    };
  }>,
  openNew: vi.fn(),
  select: vi.fn(),
  updateSettingsTabState: vi.fn(),
  updateTemplatesTabState: vi.fn(),
}));

const lingui = vi.hoisted(() => {
  const t = (
    input: TemplateStringsArray | { message?: string } | string,
    ...values: unknown[]
  ) => {
    if (Array.isArray(input)) {
      return input.reduce(
        (message, part, index) =>
          `${message}${part}${index < values.length ? String(values[index]) : ""}`,
        "",
      );
    }

    if (typeof input === "string") {
      return input;
    }

    if ("message" in input) {
      return input.message ?? "";
    }

    return "";
  };

  return { t };
});

vi.mock("@lingui/react/macro", () => ({
  Trans: ({
    children,
    id,
    message,
  }: {
    children?: ReactNode;
    id?: string;
    message?: string;
  }) => <>{children ?? message ?? id}</>,
  useLingui: () => ({
    _: lingui.t,
    t: lingui.t,
  }),
}));

vi.mock("./custom-sidebar-header", () => ({
  CustomSidebarHeader: () => <div />,
}));

vi.mock("~/store/zustand/tabs", () => {
  const getState = () => ({
    currentTab: mocks.currentTab,
    tabs: mocks.tabs,
    openNew: mocks.openNew,
    select: mocks.select,
    updateSettingsTabState: mocks.updateSettingsTabState,
    updateTemplatesTabState: mocks.updateTemplatesTabState,
  });
  const useTabs = Object.assign(
    (selector: (state: unknown) => unknown) => selector(getState()),
    { getState },
  );

  return {
    useTabs,
  };
});

import { SettingsNav } from "./settings";

describe("SettingsNav", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.currentTab = { type: "settings", state: { tab: "app" } };
    mocks.tabs = [];
    mocks.openNew.mockClear();
    mocks.select.mockClear();
    mocks.updateSettingsTabState.mockClear();
    mocks.updateTemplatesTabState.mockClear();
  });

  const openedSettingsTab = () =>
    mocks.updateSettingsTabState.mock.lastCall?.[1] as
      | { tab: string }
      | undefined;

  it("offers no Account entry", () => {
    render(<SettingsNav />);

    expect(screen.getByRole("button", { name: "General" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Account" })).toBeNull();
  });

  it.each([
    ["Permissions", "permissions"],
    ["General", "app"],
  ])("opens %s inside settings", (label, tab) => {
    render(<SettingsNav />);

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(mocks.updateSettingsTabState).toHaveBeenCalledWith(
      mocks.currentTab,
      { tab },
    );
  });

  it.each([["Calendar", "calendar"]])(
    "opens the %s workspace in a new tab",
    (label, type) => {
      render(<SettingsNav />);

      fireEvent.click(screen.getByRole("button", { name: label }));

      expect(mocks.openNew).toHaveBeenCalledWith({ type });
    },
  );

  it("no longer offers Insights or Stats", () => {
    render(<SettingsNav />);
    expect(screen.getByRole("button", { name: "General" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Insights" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Stats" })).toBeNull();
  });

  it("opens former Pro features directly", () => {
    render(<SettingsNav />);

    for (const [label, tab] of [
      ["Dictation", "dictation"],
      ["Dictionary", "dictionary"],
    ]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(openedSettingsTab()).toEqual({ tab });
    }
  });

  it("filters nav items by item or group label", () => {
    render(<SettingsNav />);
    const input = screen.getByPlaceholderText("Search settings...");

    fireEvent.change(input, { target: { value: "appear" } });
    expect(screen.getByText("Appearance")).toBeTruthy();
    expect(screen.queryByText("Meetings")).toBeNull();

    fireEvent.change(input, { target: { value: "library" } });
    expect(screen.getByText("Folders")).toBeTruthy();
    expect(screen.getByText("Dictionary")).toBeTruthy();
    expect(screen.queryByText("Appearance")).toBeNull();
  });

  it("groups existing settings by the task users are trying to do", () => {
    render(<SettingsNav />);

    const contains = (group: string, label: string) =>
      screen.getByText(group).parentElement?.textContent?.includes(label);

    expect(contains("Setup", "AI")).toBe(true);
    expect(contains("Setup", "Transcription")).toBe(true);
    expect(contains("Setup", "Permissions")).toBe(true);
    expect(contains("Setup", "Dictation")).toBe(true);
    expect(contains("Meeting capture", "Meetings")).toBe(true);
    expect(contains("Meeting capture", "Calendar")).toBe(true);
    expect(contains("Meeting capture", "Notifications")).toBe(true);
    expect(contains("Library", "Folders")).toBe(true);
    expect(contains("Library", "Dictionary")).toBe(true);
    expect(screen.queryByRole("button", { name: "Automations" })).toBeNull();
    expect(contains("Appearance & general", "Appearance")).toBe(true);
    expect(contains("Appearance & general", "General")).toBe(true);
  });

  it("shows an empty state when no settings match", () => {
    render(<SettingsNav />);

    fireEvent.change(screen.getByPlaceholderText("Search settings..."), {
      target: { value: "zzzzzz" },
    });

    expect(screen.getByText("No results found.")).toBeTruthy();
  });

  it.each([
    [
      "the clear button",
      () => {
        fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
      },
    ],
    [
      "Escape",
      () => {
        fireEvent.keyDown(screen.getByPlaceholderText("Search settings..."), {
          key: "Escape",
        });
      },
    ],
  ])("restores the full list when search is cleared with %s", (_, clear) => {
    render(<SettingsNav />);

    fireEvent.change(screen.getByPlaceholderText("Search settings..."), {
      target: { value: "audio" },
    });
    expect(screen.queryByText("Appearance")).toBeNull();

    clear();

    expect(screen.getByText("Appearance")).toBeTruthy();
  });
});
