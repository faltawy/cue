import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  self: undefined as { name: string } | null | undefined,
  done: false,
  accountFullName: vi.fn(),
  updateHuman: vi.fn(),
  setSettingValue: vi.fn(),
}));

vi.mock("~/shared/owner-user", () => ({ useOwnerUserId: () => "self" }));
vi.mock("~/shared/config", () => ({ useConfigValue: () => mocks.done }));
vi.mock("~/settings/queries", () => ({
  setSettingValue: mocks.setSettingValue,
}));
vi.mock("~/types/tauri.gen", () => ({
  commands: { accountFullName: mocks.accountFullName },
}));
vi.mock("./queries", () => ({
  usePersonalContact: () => ({ data: mocks.self }),
  updateHuman: mocks.updateHuman,
}));

import { SelfNameBackfill } from "./self-name";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.done = false;
  mocks.accountFullName.mockResolvedValue("  Ahmad Falta ");
  mocks.updateHuman.mockResolvedValue(undefined);
  mocks.setSettingValue.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("SelfNameBackfill", () => {
  it("names an unnamed local user from the macOS account, once", async () => {
    mocks.self = { name: "" };
    render(<SelfNameBackfill />);

    await waitFor(() =>
      expect(mocks.setSettingValue).toHaveBeenCalledWith(
        "self_name_backfilled",
        true,
      ),
    );
    expect(mocks.updateHuman).toHaveBeenCalledWith("self", {
      name: "Ahmad Falta",
    });
  });

  it("never replaces a name the local user already has", async () => {
    mocks.self = { name: "Falta" };
    render(<SelfNameBackfill />);

    await waitFor(() =>
      expect(mocks.setSettingValue).toHaveBeenCalledWith(
        "self_name_backfilled",
        true,
      ),
    );
    expect(mocks.updateHuman).not.toHaveBeenCalled();
  });

  it("waits for the local user's row instead of spending the one attempt", async () => {
    mocks.self = null;
    const { rerender } = render(<SelfNameBackfill />);
    await Promise.resolve();
    expect(mocks.setSettingValue).not.toHaveBeenCalled();

    mocks.self = { name: "" };
    rerender(<SelfNameBackfill />);
    await waitFor(() =>
      expect(mocks.updateHuman).toHaveBeenCalledWith("self", {
        name: "Ahmad Falta",
      }),
    );
  });
});
