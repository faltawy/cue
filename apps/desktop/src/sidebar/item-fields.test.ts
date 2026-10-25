import { describe, expect, it } from "vitest";

import {
  formatSidebarItemTags,
  parseSessionTagNames,
  resolveSidebarItemMeta,
} from "./item-fields";

import { TimelineGroupBy } from "~/sidebar/enums";

describe("parseSessionTagNames", () => {
  it("trims, dedupes, and sorts JSON tag names", () => {
    expect(
      parseSessionTagNames(JSON.stringify(["prep", " launch", "prep"])),
    ).toEqual(["launch", "prep"]);
  });

  it("keeps commas that belong to a tag name", () => {
    expect(
      parseSessionTagNames(JSON.stringify(["launch, prep", "design"])),
    ).toEqual(["design", "launch, prep"]);
  });

  it("returns no tags for empty or invalid input", () => {
    expect(parseSessionTagNames(null)).toEqual([]);
    expect(parseSessionTagNames("")).toEqual([]);
    expect(parseSessionTagNames("not-json")).toEqual([]);
    expect(parseSessionTagNames(JSON.stringify({ name: "launch" }))).toEqual(
      [],
    );
  });
});

describe("resolveSidebarItemMeta", () => {
  it.each([
    [
      "shows the folder by default",
      true,
      false,
      TimelineGroupBy.Date,
      "CS 101/week-3",
      [],
    ],
    [
      "hides the folder when grouped by folder",
      true,
      true,
      TimelineGroupBy.Folder,
      "",
      ["launch"],
    ],
    [
      "omits fields the user turned off",
      false,
      false,
      TimelineGroupBy.Date,
      "",
      [],
    ],
  ] as const)("%s", (_, showFolder, showTags, groupBy, folder, tags) => {
    expect(
      resolveSidebarItemMeta({
        folderId: "CS 101/week-3",
        tags: ["launch"],
        showFolder,
        showTags,
        groupBy,
      }),
    ).toEqual({ folder, tags });
  });
});

describe("formatSidebarItemTags", () => {
  it("shows the first tags and counts the rest instead of cutting them off", () => {
    expect(
      formatSidebarItemTags(["design", "q4", "urgent", "legal", "emea"]),
    ).toEqual({ text: "#design #q4", overflow: 3 });
    expect(formatSidebarItemTags(["design"])).toEqual({
      text: "#design",
      overflow: 0,
    });
    expect(formatSidebarItemTags([])).toEqual({ text: "", overflow: 0 });
  });
});
