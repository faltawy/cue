import { describe, expect, test, vi } from "vitest";

import { getSessionResourcePath } from "./resource-path";

vi.mock("@tauri-apps/api/path", () => ({
  sep: vi.fn().mockReturnValue("/"),
}));

describe("getSessionResourcePath", () => {
  test("builds the resource directory for a session", () => {
    expect(getSessionResourcePath("/data/cue", "session-123")).toBe(
      "/data/cue/sessions/session-123",
    );
  });
});
