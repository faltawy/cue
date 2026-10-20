import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tags: [] as string[],
  tagCounts: [] as Array<{ name: string; count: number }>,
  addSessionTag: vi.fn(),
  removeSessionTag: vi.fn(),
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
  useSessionTagNames: () => mocks.tags,
  useTagCounts: () => mocks.tagCounts,
  addSessionTag: mocks.addSessionTag,
  removeSessionTag: mocks.removeSessionTag,
}));

import { SessionTagsEditor } from "./tags";

function renderEditor() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionTagsEditor sessionId="note-1" />
    </QueryClientProvider>,
  );
  return screen.getByRole("combobox", { name: "Add tag" });
}

describe("SessionTagsEditor", () => {
  beforeEach(() => {
    mocks.tags = ["budget"];
    mocks.tagCounts = [
      { name: "pricing", count: 4 },
      { name: "budget", count: 2 },
      { name: "hiring", count: 1 },
    ];
    mocks.addSessionTag.mockReset().mockResolvedValue("pricing");
    mocks.removeSessionTag.mockReset().mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("completes an existing tag instead of creating a near-duplicate", async () => {
    const input = renderEditor();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "pri" } });
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["#pricing", "Create#pri"]);
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mocks.addSessionTag).toHaveBeenCalledWith("note-1", "pricing");
    });
  });

  it("creates a new tag and never suggests one the note already has", async () => {
    const input = renderEditor();

    fireEvent.focus(input);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "#pricing",
      "#hiring",
    ]);
    fireEvent.change(input, { target: { value: "#Roadmap" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mocks.addSessionTag).toHaveBeenCalledWith("note-1", "Roadmap");
    });
  });

  it("removes a tag from the note", async () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Remove tag budget" }));

    await waitFor(() => {
      expect(mocks.removeSessionTag).toHaveBeenCalledWith("note-1", "budget");
    });
  });
});
