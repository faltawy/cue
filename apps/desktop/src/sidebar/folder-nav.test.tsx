import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  folders: [] as string[],
  counts: {} as Record<string, number>,
  createNamedFolder: vi.fn(),
  deleteNamedFolder: vi.fn(),
  renameNamedFolder: vi.fn(),
}));

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce(
        (message, part, index) =>
          `${message}${part}${index < values.length ? String(values[index]) : ""}`,
        "",
      ),
  }),
}));

vi.mock("~/session/queries", () => ({
  useFolderPaths: () => mocks.folders,
  useFolderNoteCounts: () => mocks.counts,
  useFolderIcons: () => ({}),
}));

vi.mock("~/session/folder-catalog", () => ({
  createNamedFolder: mocks.createNamedFolder,
  deleteNamedFolder: mocks.deleteNamedFolder,
  renameNamedFolder: mocks.renameNamedFolder,
}));

import { SidebarFolderNav } from "./folder-nav";
import { resetSidebarNotes, useSidebarNotes } from "./note-filter";

const folderRow = (name: string) =>
  screen.getByRole("button", {
    name: (accessibleName) =>
      accessibleName.startsWith(name) && !accessibleName.endsWith("actions"),
  });

function openFolderMenu(name: string) {
  const trigger = screen.getByRole("button", {
    name: `${name} folder actions`,
  });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
}

function submitFolderName(value: string, confirm: string) {
  fireEvent.change(screen.getByLabelText("Folder name"), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: confirm }));
}

describe("SidebarFolderNav", () => {
  beforeEach(() => {
    resetSidebarNotes();
    mocks.folders = ["Clients", "Clients/Northwind", "Inbox"];
    mocks.counts = { "": 4, Clients: 1, "Clients/Northwind": 2, Inbox: 3 };
    mocks.createNamedFolder.mockReset();
    mocks.deleteNamedFolder.mockReset();
    mocks.renameNamedFolder.mockReset();
    mocks.createNamedFolder.mockImplementation(async (path: string) => path);
    mocks.renameNamedFolder.mockImplementation(
      async (_from: string, to: string) => to,
    );
  });

  afterEach(() => {
    cleanup();
    resetSidebarNotes();
  });

  it("filters notes by a folder and clears back to all notes", () => {
    render(<SidebarFolderNav />);

    const clients = folderRow("Clients");
    expect(within(clients).getByText("3")).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /^All notes/ })).getByText(
        "10",
      ),
    ).toBeTruthy();

    fireEvent.click(clients);
    expect(useSidebarNotes.getState().folderFilter).toBe("Clients");
    expect(folderRow("Northwind")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^All notes/ }));
    expect(useSidebarNotes.getState().folderFilter).toBeNull();
  });

  it("creates a subfolder inside the chosen folder", async () => {
    render(<SidebarFolderNav />);

    openFolderMenu("Clients");
    fireEvent.click(screen.getByRole("menuitem", { name: "New subfolder" }));
    submitFolderName("Contoso", "Create");

    await waitFor(() => {
      expect(mocks.createNamedFolder).toHaveBeenCalledWith("Clients/Contoso");
    });
  });

  it("renames a nested folder within its parent and keeps the filter on it", async () => {
    useSidebarNotes.getState().setFolderFilter("Clients/Northwind");
    render(<SidebarFolderNav />);

    openFolderMenu("Northwind");
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename…" }));
    submitFolderName("Contoso", "Rename");

    await waitFor(() => {
      expect(mocks.renameNamedFolder).toHaveBeenCalledWith(
        "Clients/Northwind",
        "Clients/Contoso",
      );
      expect(useSidebarNotes.getState().folderFilter).toBe("Clients/Contoso");
    });
  });

  it("moves a folder into another folder from its menu", async () => {
    render(<SidebarFolderNav />);

    openFolderMenu("Inbox");
    const moveTo = screen.getByRole("menuitem", { name: "Move to" });
    fireEvent.focus(moveTo);
    fireEvent.keyDown(moveTo, { key: "ArrowRight" });
    expect(screen.queryByRole("menuitem", { name: "Top level" })).toBeNull();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Clients" }));

    await waitFor(() => {
      expect(mocks.renameNamedFolder).toHaveBeenCalledWith(
        "Inbox",
        "Clients/Inbox",
      );
    });
  });
});
