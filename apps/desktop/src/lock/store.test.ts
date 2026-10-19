import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateDevice: vi.fn(),
  isDeviceAuthAvailable: vi.fn(),
}));

vi.mock("./auth", () => ({
  authenticateDevice: mocks.authenticateDevice,
  isDeviceAuthAvailable: mocks.isDeviceAuthAvailable,
}));

import { isLockedFlag } from "./flag";
import { useAppLock } from "./store";

describe("isLockedFlag", () => {
  it("treats sqlite integers and booleans as locked", () => {
    expect(isLockedFlag(1)).toBe(true);
    expect(isLockedFlag(true)).toBe(true);
    expect(isLockedFlag(0)).toBe(false);
    expect(isLockedFlag(false)).toBe(false);
    expect(isLockedFlag(null)).toBe(false);
  });
});

describe("note lock store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateDevice.mockResolvedValue(true);
    useAppLock.setState({
      available: null,
      authenticating: false,
      revealedNoteIds: {},
    });
  });

  it("reveals a note after authentication", async () => {
    await expect(
      useAppLock.getState().revealNote("session-1", "open"),
    ).resolves.toBe(true);
    expect(useAppLock.getState().isNoteRevealed("session-1")).toBe(true);
  });

  it("keeps a note hidden when authentication is refused", async () => {
    mocks.authenticateDevice.mockResolvedValue(false);
    await expect(
      useAppLock.getState().revealNote("session-1", "open"),
    ).resolves.toBe(false);
    expect(useAppLock.getState().isNoteRevealed("session-1")).toBe(false);
  });

  it("conceals a revealed note again", () => {
    useAppLock.setState({ revealedNoteIds: { "session-1": true } });
    useAppLock.getState().concealNote("session-1");
    expect(useAppLock.getState().isNoteRevealed("session-1")).toBe(false);
  });
});
