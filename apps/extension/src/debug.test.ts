import { expect, test } from "bun:test";

import {
  clearDebug,
  debug,
  DebugEvent,
  exportDebug,
  initializeDebug,
} from "./debug";

test("keeps a bounded diagnostic history only while enabled and clears it on opt-out", async () => {
  const original = globalThis.chrome;
  let changed: (
    changes: Record<string, { newValue: boolean }>,
    area: string,
  ) => void = () => {};
  globalThis.chrome = {
    storage: {
      local: { get: async () => ({ debugEnabled: true }) },
      session: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {},
      },
      onChanged: {
        addListener: (listener: typeof changed) => {
          changed = listener;
        },
      },
    },
    runtime: { getManifest: () => ({ version: "1.0" }) },
  } as unknown as typeof chrome;
  try {
    await initializeDebug();
    for (let index = 0; index < 450; index++)
      debug(DebugEvent.Connection, {
        run_id: String(index),
        code: "connected",
      });
    const report = exportDebug();
    expect(report.entries).toHaveLength(400);
    expect(report.entries[0]?.run_id).toBe("50");
    expect(report.entries.at(-1)?.run_id).toBe("449");
    changed({ debugEnabled: { newValue: false } }, "local");
    debug(DebugEvent.Connection, { run_id: "after-opt-out" });
    expect(exportDebug()).toMatchObject({ enabled: false, entries: [] });
  } finally {
    await clearDebug();
    globalThis.chrome = original;
  }
});
