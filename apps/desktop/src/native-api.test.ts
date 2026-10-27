import { afterEach, expect, it, vi } from "vitest";

import { invoke } from "./native-api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("preserves native results and failures without logging private payloads", async () => {
  const records: unknown[][] = [];
  vi.spyOn(console, "info").mockImplementation((...args) => records.push(args));
  vi.spyOn(console, "error").mockImplementation((...args) =>
    records.push(args),
  );
  const failure = new Error("private-provider-response");
  const native = vi
    .fn()
    .mockResolvedValueOnce("private-transcript")
    .mockRejectedValueOnce(failure);
  vi.stubGlobal("__TAURI_INTERNALS__", { invoke: native });
  await expect(
    invoke("plugin:dictation|capture_target", { text: "private-note" }),
  ).resolves.toBe("private-transcript");
  await expect(
    invoke("plugin:dictation|insert_text", { text: "private-note" }),
  ).rejects.toBe(failure);
  expect(native).toHaveBeenCalledWith(
    "plugin:dictation|capture_target",
    { text: "private-note" },
    undefined,
  );
  expect(records).toHaveLength(4);
  expect(records[1][1]).toMatchObject({
    command: "plugin:dictation|capture_target",
    durationMs: expect.any(Number),
  });
  expect(records[3][1]).toMatchObject({
    command: "plugin:dictation|insert_text",
    errorType: "Error",
  });
  expect(JSON.stringify(records)).not.toContain("private-");
});
