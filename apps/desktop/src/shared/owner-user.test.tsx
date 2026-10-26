import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ user_id: string }>,
}));

vi.mock("~/db", () => ({
  useLiveQuery: ({ mapRows }: any) => {
    return { data: mapRows(mocks.rows) };
  },
}));

import { useOwnerUserId } from "./owner-user";

import { DEFAULT_USER_ID } from "~/shared/utils";

describe("useOwnerUserId", () => {
  beforeEach(() => {
    mocks.rows = [];
  });

  it("returns the canonical SQLite owner", () => {
    mocks.rows = [{ user_id: "user-1" }];

    expect(renderHook(() => useOwnerUserId()).result.current).toBe("user-1");
  });

  it("uses the stable local owner when no canonical row exists", () => {
    expect(renderHook(() => useOwnerUserId()).result.current).toBe(
      DEFAULT_USER_ID,
    );
  });
});
