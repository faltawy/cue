import { describe, expect, it } from "vitest";

import {
  availableChangelogVersions,
  hasChangelogFor,
  useChangelogContent,
} from "./data";

describe("release changelogs", () => {
  it("makes current and past release notes available by version", () => {
    expect(hasChangelogFor("0.6.0")).toBe(true);
    expect(hasChangelogFor("0.5.2")).toBe(true);
    expect(useChangelogContent("0.6.0")).toContain(
      "Improve multilingual coaching",
    );
    expect(useChangelogContent("0.5.2")).toContain("current name");
    expect(availableChangelogVersions()[0]).toBe("0.6.0");
    expect(availableChangelogVersions()).toContain("0.5.2");
  });
});
