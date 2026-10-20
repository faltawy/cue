import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tagCounts: [] as Array<{ name: string; count: number }>,
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

vi.mock("~/session/tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/session/tags")>()),
  useTagCounts: () => mocks.tagCounts,
}));

import { resetSidebarNotes, useSidebarNotes } from "./note-filter";
import { SidebarTagNav } from "./tag-nav";

describe("SidebarTagNav", () => {
  beforeEach(() => {
    resetSidebarNotes();
    mocks.tagCounts = [
      { name: "pricing", count: 3 },
      { name: "hiring", count: 1 },
    ];
  });

  afterEach(() => {
    cleanup();
    resetSidebarNotes();
  });

  it("filters notes by a tag and clicking it again clears the filter", () => {
    render(<SidebarTagNav />);

    fireEvent.click(
      screen.getByRole("button", { name: "Show notes tagged pricing" }),
    );
    expect(useSidebarNotes.getState().tagFilter).toBe("pricing");

    fireEvent.click(
      screen.getByRole("button", { name: "Stop filtering by pricing" }),
    );
    expect(useSidebarNotes.getState().tagFilter).toBeNull();
  });

  it("keeps a filtered tag clearable after its last note loses it", () => {
    useSidebarNotes.getState().setTagFilter("archived");
    render(<SidebarTagNav />);

    fireEvent.click(
      screen.getByRole("button", { name: "Stop filtering by archived" }),
    );

    expect(useSidebarNotes.getState().tagFilter).toBeNull();
    expect(
      screen.getByRole("button", { name: "Show notes tagged hiring" }),
    ).toBeTruthy();
  });
});
