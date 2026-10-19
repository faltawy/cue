import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSessionParticipants } from "./participants";

const mocks = vi.hoisted(() => ({ rows: [] as Record<string, string>[] }));

vi.mock("~/db", () => ({
  useLiveQuery: ({ mapRows }: { mapRows: (rows: unknown[]) => unknown }) => ({
    data: mapRows(mocks.rows),
  }),
}));

vi.mock("~/db/write-queue", () => ({ enqueueDatabaseWrite: vi.fn() }));

function row(id: string, name: string, email: string) {
  return {
    id,
    session_id: "session-1",
    human_id: `human-${id}`,
    source: "manual",
    name,
    email,
    job_title: "",
    linkedin_username: "",
    organization_id: "",
    organization_name: "",
  };
}

describe("useSessionParticipants", () => {
  it("orders people by the name shown, falling back to the email", () => {
    // SQLite's byte order: empty, leading space, upper case, lower, accented.
    mocks.rows = [
      row("1", "", "ops@sub.department.region.example.co.uk"),
      row("2", "  Sam   Lee ", "sam@example.com"),
      row("3", "Zed", "zed@example.com"),
      row("4", "aiyana", "aiyana@example.com"),
      row("5", "Ólafur", "olafur@example.is"),
    ];

    const { result } = renderHook(() => useSessionParticipants("session-1"));

    expect(
      result.current.map((participant) => participant.name || participant.email),
    ).toEqual([
      "aiyana",
      "Ólafur",
      "ops@sub.department.region.example.co.uk",
      "Sam   Lee",
      "Zed",
    ]);
  });
});
