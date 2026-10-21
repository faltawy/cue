import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@anlg/ui/components/ui/tooltip";

const mocks = vi.hoisted(() => ({
  events: {} as Record<string, Record<string, unknown>>,
  newNoteAndListen: vi.fn(),
  getOrCreateSessionForEventId: vi.fn(async () => "session-for-event"),
  openSessionAndListen: vi.fn(),
}));

vi.mock("~/shared/main", () => ({
  StandardContentWrapper: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("~/shared/useNewNote", () => ({
  useNewNote: () => vi.fn(),
  useNewNoteAndListen: () => mocks.newNoteAndListen,
  openSessionAndListen: mocks.openSessionAndListen,
}));

vi.mock("~/session/queries", () => ({
  getOrCreateSessionForEventId: mocks.getOrCreateSessionForEventId,
}));

vi.mock("~/calendar/queries", () => ({
  useTimelineEventsTable: () => mocks.events,
}));

vi.mock("~/calendar/ignored-events", () => ({
  useIgnoredEvents: () => ({ isIgnored: () => false }),
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: (key: string) =>
    key === "coach_shortcut"
      ? "Super+Shift+KeyK"
      : key === "timezone"
        ? ""
        : false,
}));

vi.mock("@anlg/plugin-coach", () => ({
  commands: { show: vi.fn(async () => ({ status: "ok", data: null })) },
}));

import { TabContentEmpty } from "./empty";

function renderHome() {
  return render(
    <TooltipProvider>
      <TabContentEmpty
        tab={{
          active: true,
          pinned: false,
          slotId: "slot-home",
          type: "empty",
        }}
      />
    </TooltipProvider>,
  );
}

describe("TabContentEmpty", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.events = {};
  });

  it("offers to record the next calendar meeting with the coach", async () => {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    mocks.events = {
      "event-1": {
        title: "Weekly sync with Acme",
        started_at: start.toISOString(),
        ended_at: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
        has_recurrence_rules: false,
      },
    };
    renderHome();

    expect(screen.getByText("Weekly sync with Acme")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Start recording/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Record with coach/ }));

    await waitFor(() =>
      expect(mocks.openSessionAndListen).toHaveBeenCalledWith(
        "session-for-event",
        { behavior: "current" },
      ),
    );
    expect(mocks.getOrCreateSessionForEventId).toHaveBeenCalledWith("event-1");
  });

  it("falls back to starting a recording when no meeting is coming up", () => {
    renderHome();

    expect(
      screen.getByText("Your coach is ready for the next meeting"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Record with coach/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
    expect(mocks.newNoteAndListen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /New note/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Open coach/ })).toBeTruthy();
  });
});
