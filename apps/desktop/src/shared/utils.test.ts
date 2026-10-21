import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIdentifier: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getIdentifier: mocks.getIdentifier,
}));

import { getScheme } from "./utils";

describe("getScheme", () => {
  beforeEach(() => {
    mocks.getIdentifier.mockReset();
  });

  it.each([
    ["com.hyprnote.stable", "cue"],
    ["com.hyprnote.Hyprnote", "cue"],
    ["com.hyprnote.staging", "cue-staging"],
    ["com.hyprnote.nightly", "cue-nightly"],
    ["com.hyprnote.dev", "cue-dev"],
    ["so.anarlog.Anarlog", "cue"],
    ["unknown", "cue"],
  ])("maps %s to %s", async (identifier, scheme) => {
    mocks.getIdentifier.mockResolvedValue(identifier);

    await expect(getScheme()).resolves.toBe(scheme);
  });
});
