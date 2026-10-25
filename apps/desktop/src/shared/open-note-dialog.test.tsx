import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render as renderWithoutQueries,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NoteSearchHit } from "~/search/contexts/engine";

const mocks = vi.hoisted(() => ({
  openCurrent: vi.fn(),
  openNew: vi.fn(),
  onOpenChange: vi.fn(),
  newNote: vi.fn(),
  newNoteAndListen: vi.fn(),
  recentlyOpenedSessionIds: [] as string[],
  searchNotes: vi.fn(async (_query: string): Promise<NoteSearchHit[]> => []),
  sessions: [] as Array<{
    id: string;
    title: string;
    created_at: string;
  }>,
  humans: [] as Array<{
    id: string;
    name: string;
    email: string;
    jobTitle: string;
    additionalEmails: string[];
  }>,
}));

vi.mock("~/session/queries", () => ({
  useSessionSummaries: () => mocks.sessions,
}));

vi.mock("~/contacts/queries", () => ({
  useHumans: () => mocks.humans,
}));

vi.mock("~/search/contexts/engine", () => ({
  useSearchEngine: () => ({ searchNotes: mocks.searchNotes }),
}));

vi.mock("~/shared/useNewNote", () => ({
  useNewNote: () => mocks.newNote,
  useNewNoteAndListen: () => mocks.newNoteAndListen,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (
    selector: (state: {
      openCurrent: typeof mocks.openCurrent;
      openNew: typeof mocks.openNew;
      recentlyOpenedSessionIds: string[];
    }) => unknown,
  ) =>
    selector({
      openCurrent: mocks.openCurrent,
      openNew: mocks.openNew,
      recentlyOpenedSessionIds: mocks.recentlyOpenedSessionIds,
    }),
}));

import { OpenNoteDialog } from "./open-note-dialog";

const render = (ui: ReactElement) =>
  renderWithoutQueries(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {ui}
    </QueryClientProvider>,
  );

const search = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText("Search or jump to…"), {
    target: { value },
  });

const optionNames = () =>
  screen
    .getAllByRole("option")
    .map((option) => option.getAttribute("data-value"));

describe("OpenNoteDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessions = [];
    mocks.humans = [];
    mocks.recentlyOpenedSessionIds = [];
    mocks.searchNotes.mockResolvedValue([]);
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(cleanup);

  it("closes through the shared dialog escape behavior", () => {
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("opens a local note from the recent notes", () => {
    mocks.sessions = [
      {
        id: "local-session",
        title: "Owned canonical note",
        created_at: "2026-07-15T09:00:00.000Z",
      },
    ];

    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    expect(
      screen.getByRole("dialog", { name: "Search or jump to…" }),
    ).toBeTruthy();
    expect(
      document.querySelector("[data-open-note-dialog-drag-region]"),
    ).toBeTruthy();
    expect(screen.getByText("Recent")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("option", { name: "Owned canonical note" }),
    );

    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.openCurrent).toHaveBeenCalledWith({
      type: "sessions",
      id: "local-session",
    });
  });

  it("shows actions and top-level pages when the query is empty", () => {
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.getByText("Go to")).toBeTruthy();
    expect(screen.getByRole("option", { name: "New note" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Contacts" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Transcription" })).toBeNull();
  });

  it("runs an action from the menu", () => {
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    fireEvent.click(screen.getByRole("option", { name: "Record a meeting" }));

    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.newNoteAndListen).toHaveBeenCalledOnce();
    expect(mocks.newNote).not.toHaveBeenCalled();
  });

  it("opens a matching page from the global navigator", () => {
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    search("contact");
    fireEvent.click(screen.getByRole("option", { name: "Contacts" }));

    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.openNew).toHaveBeenCalledWith({ type: "contacts" });
  });

  it("opens a matching settings sub-page", () => {
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    search("transcription");
    fireEvent.click(screen.getByRole("option", { name: /Transcription/ }));

    expect(mocks.openNew).toHaveBeenCalledWith({
      type: "settings",
      state: { tab: "transcription" },
    });
  });

  it("finds a person by email and opens their contact", () => {
    mocks.humans = [
      {
        id: "sara",
        name: "Sara Ahmed",
        email: "sara@northwind.com",
        jobTitle: "",
        additionalEmails: [],
      },
      {
        id: "omar",
        name: "Omar Ali",
        email: "omar@example.com",
        jobTitle: "",
        additionalEmails: [],
      },
    ];
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    search("northwind.com");

    expect(screen.getByText("People")).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Omar Ali" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Sara Ahmed" }));

    expect(mocks.openNew).toHaveBeenCalledWith({
      type: "contacts",
      state: { selected: { type: "person", id: "sara" } },
    });
  });

  it("ranks a title that starts with the query above one that only contains it", () => {
    mocks.sessions = [
      {
        id: "async",
        title: "Async planning",
        created_at: "2026-07-17T09:00:00Z",
      },
      {
        id: "weekly",
        title: "Weekly sync",
        created_at: "2026-07-16T09:00:00Z",
      },
      {
        id: "sync",
        title: "Sync with Sara",
        created_at: "2026-07-15T09:00:00Z",
      },
    ];
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    search("sync");

    expect(optionNames()).toEqual(["note-sync", "note-weekly", "note-async"]);
  });

  it("opens the highlighted note in a new tab with mod+enter", () => {
    mocks.sessions = [
      {
        id: "sync",
        title: "Sync with Sara",
        created_at: "2026-07-15T09:00:00Z",
      },
    ];
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    search("sync");
    fireEvent.keyDown(screen.getByPlaceholderText("Search or jump to…"), {
      key: "Enter",
      metaKey: true,
    });

    expect(mocks.openNew).toHaveBeenCalledWith({
      type: "sessions",
      id: "sync",
    });
    expect(mocks.openCurrent).not.toHaveBeenCalled();
  });

  it("waits for note search before offering to clear an unmatched query", async () => {
    let finishSearch!: (hits: NoteSearchHit[]) => void;
    mocks.searchNotes.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSearch = resolve;
        }),
    );
    mocks.sessions = [
      {
        id: "sync",
        title: "Sync with Sara",
        created_at: "2026-07-15T09:00:00Z",
      },
    ];
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    search("zzzz");

    expect(screen.getByRole("status").textContent).toContain("Searching notes");
    expect(screen.queryByText("No results for “zzzz”")).toBeNull();
    finishSearch([]);
    expect(await screen.findByText("No results for “zzzz”")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("option", { name: /Sync with Sara/ })).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByPlaceholderText("Search or jump to…"),
    );
  });
  it("finds a note by what was said and shows the matching passage", async () => {
    mocks.sessions = [
      {
        id: "weekly",
        title: "Weekly sync",
        created_at: "2026-07-16T09:00:00Z",
      },
      { id: "retro", title: "Retro", created_at: "2026-07-15T09:00:00Z" },
    ];
    mocks.searchNotes.mockResolvedValue([
      {
        id: "weekly",
        section: "transcript",
        snippet: [
          { text: "…we agreed the ", highlighted: false },
          { text: "pricing", highlighted: true },
          { text: " is final", highlighted: false },
        ],
      },
    ]);
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    search("pricing");

    const option = await screen.findByRole("option", { name: /Weekly sync/ });
    expect(option.textContent).toContain("Transcript");
    expect(option.querySelector("mark")?.textContent).toBe("pricing");
    expect(mocks.searchNotes).toHaveBeenLastCalledWith("pricing");
    expect(screen.queryByRole("option", { name: /Retro/ })).toBeNull();

    fireEvent.click(option);
    expect(mocks.openCurrent).toHaveBeenCalledWith({
      type: "sessions",
      id: "weekly",
    });
  });

  it("lists title matches before notes that only mention the query", async () => {
    mocks.sessions = [
      {
        id: "weekly",
        title: "Weekly sync",
        created_at: "2026-07-16T09:00:00Z",
      },
      {
        id: "pricing",
        title: "Pricing review",
        created_at: "2026-07-15T09:00:00Z",
      },
    ];
    mocks.searchNotes.mockResolvedValue([
      {
        id: "weekly",
        section: "summary",
        snippet: [{ text: "pricing", highlighted: true }],
      },
      {
        id: "pricing",
        section: "memos",
        snippet: [{ text: "pricing", highlighted: true }],
      },
    ]);
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    search("pricing");
    await screen.findByRole("option", { name: /Weekly sync/ });

    expect(optionNames()).toEqual(["note-pricing", "note-weekly"]);
  });
});
