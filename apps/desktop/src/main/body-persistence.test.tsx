import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { TooltipProvider } from "@anlg/ui/components/ui/tooltip";

const state = vi.hoisted(() => ({ currentTab: { type: "empty" } }));

// Vitest resolves the package's Node build, which disables panel interaction.
vi.mock("react-resizable-panels", async () => {
  const { createRequire } = await import("node:module");
  const { dirname, join } = await import("node:path");
  const root = dirname(
    createRequire(import.meta.url).resolve(
      "react-resizable-panels/package.json",
    ),
  );
  return import(
    /* @vite-ignore */ join(
      root,
      "dist/react-resizable-panels.browser.development.esm.js",
    )
  );
});

vi.mock("~/contexts/shell", () => ({
  useShell: () => ({
    leftsidebar: {
      expanded: true,
      setExpanded: vi.fn(),
      toggleExpanded: vi.fn(),
    },
  }),
}));
vi.mock("~/store/zustand/tabs", () => ({
  uniqueIdfromTab: (tab: { type: string }) => tab.type,
  useTabs: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock("./shell-sidebar", () => ({ ClassicMainSidebar: () => <aside /> }));
vi.mock("./tab-content", () => ({ ClassicMainTabContent: () => <main /> }));
vi.mock("./sidebar-timeline-chrome", () => ({
  SidebarTimelineChromeWithUpcomingMeeting: () => null,
}));
vi.mock("./useShortcuts", () => ({ useClassicMainShortcuts: () => {} }));
vi.mock("~/shared/open-note-dialog", () => ({
  useOpenNoteDialog: () => ({ open: vi.fn() }),
}));
vi.mock("~/shared/useNewNote", () => ({ useNewNote: () => vi.fn() }));

import { ClassicMainBody } from "./body";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("keeps the resized sidebar width across views and a fresh mount", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("innerWidth", 1000);
  localStorage.clear();
  state.currentTab = { type: "empty" };
  const view = render(<ClassicMainBody />, { wrapper: TooltipProvider });
  const separator = screen.getByRole("separator");

  fireEvent.keyDown(separator, { key: "End" });
  expect(separator.getAttribute("aria-valuenow")).toBe("36");

  for (const type of [
    "settings",
    "templates",
    "contacts",
    "calendar",
    "folders",
    "empty",
  ]) {
    state.currentTab = { type };
    view.rerender(<ClassicMainBody />);
    expect(screen.getByRole("separator").getAttribute("aria-valuenow")).toBe(
      "36",
    );
  }

  await act(() => vi.advanceTimersByTime(1000));
  view.unmount();
  state.currentTab = { type: "settings" };
  render(<ClassicMainBody />, { wrapper: TooltipProvider });
  expect(screen.getByRole("separator").getAttribute("aria-valuenow")).toBe(
    "36",
  );
});
