import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~/settings/hydration-boundary", () => ({
  SettingsHydrationBoundary: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("./general", () => ({
  SettingsApp: () => <div>General settings</div>,
  SettingsMeetings: () => null,
  SettingsNotifications: () => null,
  SettingsPermissions: () => null,
}));

vi.mock("./todo", () => ({ SettingsTodo: () => null }));
vi.mock("~/settings/claude", () => ({
  SettingsClaude: () => <div>Claude settings</div>,
}));
vi.mock("~/settings/ai/stt", () => ({ STT: () => null }));
vi.mock("~/settings/appearance", () => ({ SettingsAppearance: () => null }));
vi.mock("~/settings/dictionary", () => ({ SettingsDictionary: () => null }));
vi.mock("~/shared/main", () => ({
  StandardContentWrapper: ({ children }: { children: React.ReactNode }) =>
    children,
}));

import { TabContentSettings } from "./index";

import { createSettingsTab } from "~/store/zustand/tabs/test-utils";

describe("TabContentSettings", () => {
  afterEach(cleanup);

  it.each([
    ["app", "General settings"],
    ["claude", "Claude settings"],
  ] as const)("opens the %s destination", (destination, heading) => {
    render(
      <TabContentSettings
        tab={createSettingsTab({ state: { tab: destination } })}
      />,
    );
    expect(screen.getByText(heading)).toBeTruthy();
  });
});
