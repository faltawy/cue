import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentWindow: vi.fn(),
  isFullscreen: vi.fn(),
  onResized: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: mocks.getCurrentWindow,
}));

import { useWindowControlsGutter } from "./useWindowControlsGutter";

describe("useWindowControlsGutter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFullscreen.mockResolvedValue(false);
    mocks.onResized.mockResolvedValue(vi.fn());
    mocks.getCurrentWindow.mockReturnValue({
      label: "main",
      isFullscreen: mocks.isFullscreen,
      onResized: mocks.onResized,
    });
  });

  afterEach(cleanup);

  it("keeps the macOS gutter outside fullscreen", async () => {
    const { result } = renderHook(() => useWindowControlsGutter());

    expect(result.current).toBe(true);
    await waitFor(() => expect(mocks.isFullscreen).toHaveBeenCalledOnce());
    expect(result.current).toBe(true);
  });

  it("removes the macOS gutter in fullscreen", async () => {
    mocks.isFullscreen.mockResolvedValue(true);

    const { result } = renderHook(() => useWindowControlsGutter());

    await waitFor(() => expect(result.current).toBe(false));
  });
});
