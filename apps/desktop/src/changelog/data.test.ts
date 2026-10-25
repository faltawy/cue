import { describe, expect, it } from "vitest";

import { version } from "../../package.json";
import {
  availableChangelogVersions,
  hasChangelogFor,
  useChangelogContent,
} from "./data";

describe("release changelogs", () => {
  it("makes current and past release notes available by version", () => {
    expect(hasChangelogFor("0.6.0")).toBe(true);
    expect(hasChangelogFor("0.5.2")).toBe(true);
    expect(useChangelogContent("0.7.0")).toContain(
      "Keep speaker names and transcript corrections",
    );
    expect(useChangelogContent("0.5.2")).toContain("current name");
    expect(hasChangelogFor(version)).toBe(true);
    expect(availableChangelogVersions()[0]).toBe(version);
    expect(availableChangelogVersions()).toContain("0.5.2");
  });
});
