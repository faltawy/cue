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
  recentNotes: [] as { id: string; title: string; created_at: string }[],
  followUps: [] as {
    id: string;
    session_id: string;
    session_title: string;
    text: string;
  }[],
  newNoteAndListen: vi.fn(),
  getOrCreateSessionForEventId: vi.fn(async () => "session-for-event"),
  openSessionAndListen: vi.fn(),
  openCurrent: vi.fn(),
  openUrl: vi.fn(async () => ({ status: "ok", data: null })),
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

vi.mock("./home-data", () => ({
  useHomeRecentNotes: () => mocks.recentNotes,
  useHomeOpenFollowUps: () => mocks.followUps,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (
    selector: (state: { openCurrent: typeof mocks.openCurrent }) => unknown,
  ) => selector({ openCurrent: mocks.openCurrent }),
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

vi.mock("@anlg/plugin-opener2", () => ({
  commands: { openUrl: mocks.openUrl },
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
    mocks.recentNotes = [];
    mocks.followUps = [];
  });

  it("opens a meeting link and records the next event", async () => {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    mocks.events = {
      "event-1": {
        title: "Weekly sync with Acme",
        started_at: start.toISOString(),
        ended_at: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
        meeting_link: "https://meet.example.com/acme",
        has_recurrence_rules: false,
      },
    };
    renderHome();

    expect(screen.getByText("Weekly sync with Acme")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Start recording/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Join & record/ }));

    await waitFor(() =>
      expect(mocks.openSessionAndListen).toHaveBeenCalledWith(
        "session-for-event",
        { behavior: "current" },
      ),
    );
    expect(mocks.openUrl).toHaveBeenCalledWith(
      "https://meet.example.com/acme",
      null,
    );
    expect(mocks.getOrCreateSessionForEventId).toHaveBeenCalledWith("event-1");
  });

  it("records against the event when it has no join link", async () => {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    mocks.events = {
      "event-without-link": {
        title: "Coffee chat",
        started_at: start.toISOString(),
        ended_at: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
        has_recurrence_rules: false,
      },
    };
    renderHome();

    fireEvent.click(screen.getByRole("button", { name: "Record this event" }));

    await waitFor(() =>
      expect(mocks.openSessionAndListen).toHaveBeenCalledWith(
        "session-for-event",
        { behavior: "current" },
      ),
    );
    expect(mocks.openUrl).not.toHaveBeenCalled();
    expect(mocks.getOrCreateSessionForEventId).toHaveBeenCalledWith(
      "event-without-link",
    );
  });

  it("shows recent notes and open follow-ups linked to their source notes", () => {
    mocks.recentNotes = [
      {
        id: "recent-session",
        title: "Acme kickoff",
        created_at: "2026-10-20T12:00:00Z",
      },
    ];
    mocks.followUps = [
      {
        id: "follow-up",
        session_id: "source-session",
        session_title: "Product review",
        text: "Send the revised launch plan",
      },
    ];

    renderHome();

    fireEvent.click(screen.getByRole("button", { name: "Acme kickoff" }));
    expect(mocks.openCurrent).toHaveBeenCalledWith({
      type: "sessions",
      id: "recent-session",
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Send the revised launch plan/ }),
    );
    expect(mocks.openCurrent).toHaveBeenCalledWith({
      type: "sessions",
      id: "source-session",
    });
  });

  it("falls back to starting a recording when no meeting is coming up", () => {
    renderHome();

    expect(screen.getByText("A clearer place to start")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Join & record|Record this event/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
    expect(mocks.newNoteAndListen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /New note/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Open coach/ })).toBeTruthy();
  });
});
