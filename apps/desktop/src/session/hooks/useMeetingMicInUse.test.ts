import { describe, expect, it } from "vitest";

import { micAppsShowInUse } from "./useMeetingMicInUse";

describe("micAppsShowInUse", () => {
  it("treats a non-self app as the meeting mic", () => {
    expect(micAppsShowInUse([{ id: "us.zoom.xos", name: "Zoom" }])).toBe(true);
  });

  it("ignores Cue itself", () => {
    const selfApps = [
      { id: "com.cue.app", name: "Cue" },
      { id: "com.anarlog.app", name: "Anarlog" },
      { id: "com.hyprnote.app", name: "Hyprnote" },
    ];
    expect(micAppsShowInUse(selfApps)).toBe(false);
    expect(
      micAppsShowInUse([...selfApps, { id: "us.zoom.xos", name: "Zoom" }]),
    ).toBe(true);
  });

  it("ignores empty, pid, and duplicate ids", () => {
    expect(
      micAppsShowInUse([
        { id: "", name: "" },
        { id: "pid:1234", name: "Unknown" },
      ]),
    ).toBe(false);
    expect(
      micAppsShowInUse([
        { id: "us.zoom.xos", name: "Zoom" },
        { id: "us.zoom.xos", name: "Zoom" },
      ]),
    ).toBe(true);
  });
});
