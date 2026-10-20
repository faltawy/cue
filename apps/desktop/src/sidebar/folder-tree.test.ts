import { describe, expect, it } from "vitest";

import {
  buildFolderTree,
  folderMoveTargets,
  visibleFolderNodes,
} from "./folder-tree";

describe("folder tree", () => {
  const paths = [
    "Clients",
    "Clients/Northwind",
    "Clients/Northwind/Q4",
    "Inbox",
  ];

  it("nests folders and counts notes in subfolders toward their parents", () => {
    const roots = buildFolderTree(paths, {
      Clients: 1,
      "Clients/Northwind": 2,
      "Clients/Northwind/Q4": 3,
      "": 7,
    });

    expect(
      visibleFolderNodes(roots, new Set(["Clients", "Clients/Northwind"])).map(
        (node) => [node.path, node.name, node.depth, node.count],
      ),
    ).toEqual([
      ["Clients", "Clients", 0, 6],
      ["Clients/Northwind", "Northwind", 1, 5],
      ["Clients/Northwind/Q4", "Q4", 2, 3],
      ["Inbox", "Inbox", 0, 0],
    ]);
  });

  it("hides the children of collapsed folders", () => {
    const roots = buildFolderTree(paths, {});

    expect(
      visibleFolderNodes(roots, new Set()).map((node) => node.path),
    ).toEqual(["Clients", "Inbox"]);
  });

  it("never offers a folder's own subtree or current parent as a move target", () => {
    expect(folderMoveTargets(paths, "Clients/Northwind")).toEqual(["Inbox"]);
    expect(folderMoveTargets(paths, "Inbox")).toEqual([
      "Clients",
      "Clients/Northwind",
      "Clients/Northwind/Q4",
    ]);
  });
});
