import { afterEach, describe, expect, it } from "vitest";

import { resetSidebarNotes, useSidebarNotes } from "./note-filter";

import { TimelineGroupBy, NoteSortOrder } from "~/sidebar/enums";

describe("sidebar note filter", () => {
  afterEach(() => {
    resetSidebarNotes();
  });

  it("keeps grouping and sort independent of the folder filter", () => {
    useSidebarNotes.getState().setGroupBy(TimelineGroupBy.Folder);
    useSidebarNotes.getState().setSortOrder(NoteSortOrder.Oldest);
    useSidebarNotes.getState().setFolderFilter("CS 101");

    expect(useSidebarNotes.getState()).toMatchObject({
      folderFilter: "CS 101",
      groupBy: "folder",
      sortOrder: "oldest",
    });

    useSidebarNotes.getState().setFolderFilter(null);

    expect(useSidebarNotes.getState()).toMatchObject({
      folderFilter: null,
      groupBy: "folder",
      sortOrder: "oldest",
    });
  });
});
